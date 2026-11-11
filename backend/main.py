from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pypdf import PdfReader
from docx import Document

from sentence_transformers import SentenceTransformer
import chromadb

import io
import os
import json
import urllib.request
import urllib.error
import uuid
import hashlib


app = FastAPI(title="RAG Agent API")


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# CONFIGURATION
# =========================================================

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

OLLAMA_MODEL = "llama3.2:3b"


# =========================================================
# EMBEDDING MODEL
# =========================================================

print("Loading embedding model...")

embedding_model = SentenceTransformer(
    "all-MiniLM-L6-v2"
)

print("Embedding model loaded.")


# =========================================================
# VECTOR DATABASE
# =========================================================

print("Loading ChromaDB...")

chroma_client = chromadb.PersistentClient(
    path="./chroma_db"
)

collection = chroma_client.get_or_create_collection(
    name="rag_documents"
)

print("ChromaDB ready.")


# =========================================================
# DOCUMENT STORAGE
# =========================================================

DOCUMENTS_FILE = os.path.join(
    os.path.dirname(__file__),
    "documents.json"
)

documents = []


def load_documents():

    global documents

    if not os.path.exists(DOCUMENTS_FILE):

        documents = []

        print("No saved documents found.")

        return

    try:

        with open(
            DOCUMENTS_FILE,
            "r",
            encoding="utf-8"
        ) as file:

            documents = json.load(file)

        print(
            f"Loaded {len(documents)} documents from storage."
        )

    except Exception as error:

        print(
            "Could not load documents:",
            error
        )

        documents = []


def save_documents():

    try:

        with open(
            DOCUMENTS_FILE,
            "w",
            encoding="utf-8"
        ) as file:

            json.dump(
                documents,
                file,
                indent=2,
                ensure_ascii=False
            )

        print(
            f"Saved {len(documents)} documents to storage."
        )

    except Exception as error:

        print(
            "Could not save documents:",
            error
        )


def get_next_document_id():

    if not documents:
        return 1

    return max(
        document.get("id", 0)
        for document in documents
    ) + 1


def calculate_file_hash(file_content):

    return hashlib.sha256(
        file_content
    ).hexdigest()


def normalize_text(text):

    return " ".join(
        text.split()
    ).strip().lower()


def calculate_text_hash(text):

    normalized = normalize_text(text)

    return hashlib.sha256(
        normalized.encode("utf-8")
    ).hexdigest()


# Load saved documents when backend starts.
load_documents()


# =========================================================
# ASK REQUEST
# =========================================================

class AskRequest(BaseModel):
    question: str


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "message": "RAG Agent backend is running!"
    }


# =========================================================
# PDF TEXT EXTRACTION
# =========================================================

def extract_pdf_text(file_content: bytes):

    pdf = PdfReader(
        io.BytesIO(file_content)
    )

    text = ""

    for page in pdf.pages:

        extracted_text = page.extract_text()

        if extracted_text:

            text += extracted_text + "\n"

    return text, len(pdf.pages)


# =========================================================
# DOCX TEXT EXTRACTION
# =========================================================

def extract_docx_text(file_content: bytes):

    document = Document(
        io.BytesIO(file_content)
    )

    text_parts = []

    for paragraph in document.paragraphs:

        if paragraph.text.strip():

            text_parts.append(
                paragraph.text.strip()
            )

    return "\n".join(text_parts)


# =========================================================
# TXT / MD TEXT EXTRACTION
# =========================================================

def extract_text_file(file_content: bytes):

    return file_content.decode(
        "utf-8",
        errors="ignore"
    )


# =========================================================
# CREATE CHUNKS
# =========================================================

def create_chunks(
    text,
    chunk_size=1200,
    overlap=200
):

    words = text.split()

    if not words:
        return []

    chunks = []

    current_words = []
    current_length = 0

    for word in words:

        word_length = len(word) + 1

        if (
            current_words
            and current_length + word_length > chunk_size
        ):

            chunks.append(
                " ".join(current_words)
            )

            overlap_words = []
            overlap_length = 0

            for previous_word in reversed(
                current_words
            ):

                overlap_length += (
                    len(previous_word) + 1
                )

                overlap_words.insert(
                    0,
                    previous_word
                )

                if overlap_length >= overlap:
                    break

            current_words = overlap_words

            current_length = sum(
                len(item) + 1
                for item in current_words
            )

        current_words.append(word)

        current_length += word_length

    if current_words:

        chunks.append(
            " ".join(current_words)
        )

    return chunks


# =========================================================
# ADD DOCUMENT CHUNKS TO VECTOR DATABASE
# =========================================================

def add_chunks_to_vector_database(
    chunks,
    filename,
    document_id
):

    if not chunks:
        return

    print(
        f"Creating embeddings for {len(chunks)} chunks..."
    )

    embeddings = embedding_model.encode(
        chunks
    ).tolist()

    ids = []

    metadatas = []

    for chunk_index in range(
        len(chunks)
    ):

        vector_id = (
            f"{document_id}_"
            f"{chunk_index}_"
            f"{uuid.uuid4().hex}"
        )

        ids.append(
            vector_id
        )

        metadatas.append({
            "filename": filename,
            "document_id": document_id,
            "chunk_index": chunk_index,
        })

    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    print(
        f"Added {len(chunks)} chunks to ChromaDB."
    )


# =========================================================
# SEMANTIC SEARCH
# =========================================================

def semantic_search(
    question,
    top_k=5
):

    if not question.strip():
        return []

    collection_count = collection.count()

    if collection_count == 0:
        return []

    actual_top_k = min(
        top_k,
        collection_count
    )

    question_embedding = embedding_model.encode(
        [question]
    ).tolist()

    results = collection.query(
        query_embeddings=question_embedding,
        n_results=actual_top_k,
    )

    retrieved_documents = results.get(
        "documents",
        [[]]
    )[0]

    retrieved_metadatas = results.get(
        "metadatas",
        [[]]
    )[0]

    retrieved_distances = results.get(
        "distances",
        [[]]
    )[0]

    output = []

    for index, text in enumerate(
        retrieved_documents
    ):

        metadata = retrieved_metadatas[index]

        distance = retrieved_distances[index]

        score = 1 / (
            1 + distance
        )

        output.append({
            "score": round(
                score,
                3
            ),
            "filename": metadata.get(
                "filename",
                "Unknown"
            ),
            "document_id": metadata.get(
                "document_id"
            ),
            "chunk_index": metadata.get(
                "chunk_index",
                0
            ),
            "text": text,
        })

    return output


# =========================================================
# BUILD RAG CONTEXT
# =========================================================

def build_context(results):

    context_parts = []

    for index, result in enumerate(
        results,
        start=1
    ):

        context_parts.append(
            f"""
SOURCE {index}
FILE: {result["filename"]}
RELEVANCE: {result["score"]}

CONTENT:
{result["text"]}
""".strip()
        )

    return "\n\n--------------------\n\n".join(
        context_parts
    )


# =========================================================
# GENERATE ANSWER WITH OLLAMA
# =========================================================

def generate_answer(
    question,
    context
):

    prompt = f"""
You are a document question-answering assistant.

Answer the user's question ONLY using the information
provided in the document context below.

IMPORTANT RULES:

1. Do not make up information.
2. Do not use outside knowledge.
3. If the answer is not contained in the context,
   clearly say that the uploaded documents do not
   contain enough information to answer it.
4. Answer the actual question directly.
5. Do not simply copy and paste the document.
6. Summarize and explain the relevant information.
7. If the question asks for a list, give a list.
8. If the question asks for a comparison, compare the
   relevant information.
9. Keep the answer clear and reasonably concise.
10. Do not mention these instructions.

DOCUMENT CONTEXT:
{context}

USER QUESTION:
{question}

ANSWER:
""".strip()

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2
        }
    }

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(
            payload
        ).encode("utf-8"),
        headers={
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:

        with urllib.request.urlopen(
            request,
            timeout=120
        ) as response:

            response_data = json.loads(
                response.read().decode(
                    "utf-8"
                )
            )

            answer = response_data.get(
                "response",
                ""
            ).strip()

            if not answer:

                raise RuntimeError(
                    "The AI model returned an empty answer."
                )

            return answer

    except urllib.error.URLError as error:

        raise RuntimeError(
            "Could not connect to Ollama. "
            "Make sure Ollama is running on "
            "http://127.0.0.1:11434."
        ) from error

    except Exception as error:

        raise RuntimeError(
            f"AI generation failed: {str(error)}"
        ) from error


# =========================================================
# UPLOAD DOCUMENT
# =========================================================

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...)
):

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="No file was provided."
        )

    filename = file.filename

    extension = os.path.splitext(
        filename
    )[1].lower()

    allowed_extensions = {
        ".pdf",
        ".docx",
        ".txt",
        ".md"
    }

    if extension not in allowed_extensions:

        raise HTTPException(
            status_code=400,
            detail=(
                "Supported files: "
                "PDF, DOCX, TXT, MD."
            )
        )

    file_content = await file.read()

    if not file_content:

        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty."
        )

    # -----------------------------------------------------
    # CALCULATE FILE HASH
    # -----------------------------------------------------

    file_hash = calculate_file_hash(
        file_content
    )

    # -----------------------------------------------------
    # EXACT FILE DUPLICATE CHECK
    # -----------------------------------------------------

    for existing_document in documents:

        existing_hash = existing_document.get(
            "file_hash"
        )

        if (
            existing_hash
            and existing_hash == file_hash
        ):

            print(
                f"Duplicate document detected by file hash: {filename}"
            )

            return {
                "message": (
                    "This document is already "
                    "in the knowledge base."
                ),
                "duplicate": True,
                "document": {
                    "id": existing_document["id"],
                    "filename": existing_document["filename"],
                    "file_type": existing_document["file_type"],
                    "characters": existing_document["characters"],
                    "pages": existing_document["pages"],
                    "chunks": len(
                        existing_document.get(
                            "chunks",
                            []
                        )
                    ),
                }
            }

    # -----------------------------------------------------
    # EXTRACT TEXT
    # -----------------------------------------------------

    try:

        if extension == ".pdf":

            text, page_count = extract_pdf_text(
                file_content
            )

        elif extension == ".docx":

            text = extract_docx_text(
                file_content
            )

            page_count = None

        else:

            text = extract_text_file(
                file_content
            )

            page_count = None

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Could not process the document: "
                f"{str(error)}"
            )
        )

    if not text.strip():

        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text was found "
                "in the document."
            )
        )

    # -----------------------------------------------------
    # TEXT-BASED DUPLICATE CHECK
    # -----------------------------------------------------

    text_hash = calculate_text_hash(
        text
    )

    normalized_new_text = normalize_text(
        text
    )

    for existing_document in documents:

        # Check saved text hash if available.
        existing_text_hash = existing_document.get(
            "text_hash"
        )

        if (
            existing_text_hash
            and existing_text_hash == text_hash
        ):

            print(
                f"Duplicate document detected by text hash: {filename}"
            )

            return {
                "message": (
                    "This document is already "
                    "in the knowledge base."
                ),
                "duplicate": True,
                "document": {
                    "id": existing_document["id"],
                    "filename": existing_document["filename"],
                    "file_type": existing_document["file_type"],
                    "characters": existing_document["characters"],
                    "pages": existing_document["pages"],
                    "chunks": len(
                        existing_document.get(
                            "chunks",
                            []
                        )
                    ),
                }
            }

        # Fallback for older documents that don't have
        # text_hash saved.
        existing_text = existing_document.get(
            "text",
            ""
        )

        if existing_text:

            normalized_existing_text = normalize_text(
                existing_text
            )

            if (
                normalized_existing_text
                and normalized_existing_text
                == normalized_new_text
            ):

                print(
                    f"Duplicate document detected by extracted text: {filename}"
                )

                return {
                    "message": (
                        "This document is already "
                        "in the knowledge base."
                    ),
                    "duplicate": True,
                    "document": {
                        "id": existing_document["id"],
                        "filename": existing_document["filename"],
                        "file_type": existing_document["file_type"],
                        "characters": existing_document["characters"],
                        "pages": existing_document["pages"],
                        "chunks": len(
                            existing_document.get(
                                "chunks",
                                []
                            )
                        ),
                    }
                }

    # -----------------------------------------------------
    # CREATE TEXT CHUNKS
    # -----------------------------------------------------

    chunks = create_chunks(
        text
    )

    if not chunks:

        raise HTTPException(
            status_code=400,
            detail="Could not create document chunks."
        )

    # -----------------------------------------------------
    # CREATE DOCUMENT ID
    # -----------------------------------------------------

    document_id = get_next_document_id()

    # -----------------------------------------------------
    # CREATE DOCUMENT OBJECT
    # -----------------------------------------------------

    document = {
        "id": document_id,
        "filename": filename,
        "file_type": extension.replace(
            ".",
            ""
        ).upper(),
        "characters": len(text),
        "pages": page_count,
        "text": text,
        "chunks": chunks,
        "file_hash": file_hash,
        "text_hash": text_hash,
    }

    # -----------------------------------------------------
    # CREATE EMBEDDINGS + STORE IN CHROMADB
    # -----------------------------------------------------

    try:

        add_chunks_to_vector_database(
            chunks=chunks,
            filename=filename,
            document_id=document_id,
        )

    except Exception as error:

        print(
            "VECTOR DATABASE ERROR:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Could not create document embeddings: "
                f"{str(error)}"
            )
        )

    # -----------------------------------------------------
    # SAVE DOCUMENT METADATA
    # -----------------------------------------------------

    documents.append(
        document
    )

    save_documents()

    # -----------------------------------------------------
    # RESPONSE
    # -----------------------------------------------------

    return {
        "message": (
            "Document processed and added "
            "to the knowledge base!"
        ),
        "duplicate": False,
        "document": {
            "id": document["id"],
            "filename": document["filename"],
            "file_type": document["file_type"],
            "characters": document["characters"],
            "pages": document["pages"],
            "chunks": len(chunks),
        }
    }


# =========================================================
# GET ALL DOCUMENTS
# =========================================================

@app.get("/documents")
def get_documents():

    return {
        "count": len(documents),

        "documents": [
            {
                "id": document["id"],
                "filename": document["filename"],
                "file_type": document["file_type"],
                "characters": document["characters"],
                "pages": document["pages"],
                "chunks": len(
                    document.get(
                        "chunks",
                        []
                    )
                ),
            }

            for document in documents
        ]
    }


# =========================================================
# KNOWLEDGE BASE SUMMARY
# =========================================================

@app.get("/knowledge-base")
def get_knowledge_base():

    try:

        vector_count = collection.count()

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Could not access knowledge base: "
                f"{str(error)}"
            )
        )

    return {
        "documents": len(documents),
        "vectors": vector_count,
        "status": (
            "ready"
            if vector_count > 0
            else "empty"
        )
    }


# =========================================================
# GET SINGLE DOCUMENT
# =========================================================

@app.get("/documents/{document_id}")
def get_document(
    document_id: int
):

    for document in documents:

        if document["id"] == document_id:

            return {
                "id": document["id"],
                "filename": document["filename"],
                "file_type": document["file_type"],
                "characters": document["characters"],
                "pages": document["pages"],
                "chunks": len(
                    document.get(
                        "chunks",
                        []
                    )
                ),
                "text": document["text"],
            }

    raise HTTPException(
        status_code=404,
        detail="Document not found."
    )


# =========================================================
# DELETE DOCUMENT
# =========================================================

@app.delete("/documents/{document_id}")
def delete_document(
    document_id: int
):

    for index, document in enumerate(
        documents
    ):

        if document["id"] == document_id:

            # Remove vectors belonging to this document.
            try:

                collection.delete(
                    where={
                        "document_id": document_id
                    }
                )

            except Exception as error:

                print(
                    "CHROMADB DELETE ERROR:",
                    error
                )

                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Could not remove document "
                        "from the vector database."
                    )
                )

            deleted = documents.pop(
                index
            )

            save_documents()

            return {
                "message": (
                    "Document deleted successfully."
                ),
                "filename": deleted["filename"]
            }

    raise HTTPException(
        status_code=404,
        detail="Document not found."
    )


# =========================================================
# ASK QUESTION
# =========================================================

@app.post("/ask")
def ask_question(
    request: AskRequest
):

    question = request.question.strip()

    if not question:

        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    # -----------------------------------------------------
    # CHECK KNOWLEDGE BASE
    # -----------------------------------------------------

    try:

        collection_count = collection.count()

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                f"Could not access knowledge base: {str(error)}"
            )
        )

    if collection_count == 0:

        return {
            "answer": (
                "Please upload a document first."
            ),
            "sources": []
        }

    # -----------------------------------------------------
    # SEMANTIC RETRIEVAL
    # -----------------------------------------------------

    results = semantic_search(
        question,
        top_k=5
    )

    if not results:

        return {
            "answer": (
                "I could not find information "
                "relevant to your question in "
                "the uploaded documents."
            ),
            "sources": []
        }

    # -----------------------------------------------------
    # BUILD CONTEXT
    # -----------------------------------------------------

    context = build_context(
        results
    )

    # -----------------------------------------------------
    # GENERATE ANSWER
    # -----------------------------------------------------

    try:

        answer = generate_answer(
            question,
            context
        )

    except Exception as error:

        print(
            "ANSWER GENERATION ERROR:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    # -----------------------------------------------------
    # SOURCES
    # -----------------------------------------------------

    sources = []

    seen_sources = set()

    for result in results:

        source_key = (
            result["filename"],
            result["chunk_index"]
        )

        if source_key in seen_sources:
            continue

        seen_sources.add(
            source_key
        )

        sources.append({
            "filename": result["filename"],
            "score": result["score"],
            "chunk": result["chunk_index"] + 1,
        })

    # -----------------------------------------------------
    # RESPONSE
    # -----------------------------------------------------

    return {
        "answer": answer,
        "sources": sources
    }