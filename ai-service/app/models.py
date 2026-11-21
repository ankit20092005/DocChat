from threading import Lock

from .config import BATCH_SIZE


class Models:
    def __init__(self):
        from sentence_transformers import CrossEncoder, SentenceTransformer
        from torch import nn

        self.encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        if self.encoder.get_sentence_embedding_dimension() != 384:
            raise RuntimeError("The Atlas index requires 384-dimensional embeddings.")
        # The model supports 512 positions. Its library default truncates at 256.
        self.encoder.max_seq_length = 512
        self.reranker = CrossEncoder(
            "cross-encoder/ms-marco-MiniLM-L-6-v2", activation_fn=nn.Sigmoid(),
        )
        self.encoder_lock = Lock()
        self.reranker_lock = Lock()

    def offsets(self, text: str) -> list[tuple[int, int]]:
        # Tokenization and encode share a fast tokenizer with mutable truncation state.
        with self.encoder_lock:
            return self.encoder.tokenizer(
                text, add_special_tokens=False, truncation=False, verbose=False,
                return_offsets_mapping=True, return_attention_mask=False,
            )["offset_mapping"]

    def embed(self, texts: list[str]) -> list[list[float]]:
        with self.encoder_lock:
            return self.encoder.encode(
                texts, batch_size=BATCH_SIZE, normalize_embeddings=True,
                show_progress_bar=False, convert_to_numpy=True,
            ).tolist()

    def score(self, question: str, texts: list[str]) -> list[float]:
        with self.reranker_lock:
            return self.reranker.predict(
                [(question, text) for text in texts], show_progress_bar=False,
            ).tolist()
