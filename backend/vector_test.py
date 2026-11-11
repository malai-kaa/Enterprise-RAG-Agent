import chromadb
from sentence_transformers import SentenceTransformer

print("Loading embedding model...")

model = SentenceTransformer("all-MiniLM-L6-v2")

print("Embedding model loaded.")

client = chromadb.PersistentClient(
    path="./chroma_test"
)

collection = client.get_or_create_collection(
    name="test_collection"
)

documents = [
    "Employees receive 20 days of paid annual leave every year.",
    "Employees receive health insurance and transportation benefits.",
    "The company provides laptops and equipment for employees.",
]

embeddings = model.encode(documents).tolist()

collection.add(
    ids=["doc1", "doc2", "doc3"],
    documents=documents,
    embeddings=embeddings,
)

question = "How many vacation days do employees get?"

question_embedding = model.encode(
    [question]
).tolist()

results = collection.query(
    query_embeddings=question_embedding,
    n_results=2,
)

print("\nQUESTION:")
print(question)

print("\nRESULTS:")

for result in results["documents"][0]:
    print("-", result)