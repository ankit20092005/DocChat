from dataclasses import dataclass, field

from bson import ObjectId
from pymongo.database import Database


class Superseded(Exception):
    """The document was deleted or a later upload owns the work."""


@dataclass(frozen=True)
class Job:
    doc_id: ObjectId
    user_id: ObjectId
    attempt: ObjectId = field(default_factory=ObjectId)

    @property
    def active(self):
        return {"_id": self.doc_id, "userId": self.user_id, "ingestId": self.attempt}

    @property
    def chunks(self):
        return {"docId": self.doc_id, "userId": self.user_id}


def claim(db: Database, job: Job, size: int):
    return db.documents.find_one_and_update(
        {"_id": job.doc_id, "userId": job.user_id},
        {"$set": {"status": "processing", "ingestId": job.attempt, "indexedChunks": 0,
                  "pages": 0, "sizeBytes": size, "error": None}},
        projection={"filename": 1},
    )


def write_batch(db: Database, job: Job, rows: list[dict]):
    def write(session):
        # Writing the parent serializes this batch with replacement and deletion.
        result = db.documents.update_one(
            job.active, {"$inc": {"indexedChunks": len(rows)}}, session=session,
        )
        if not result.matched_count:
            raise Superseded()
        if rows[0]["chunkIndex"] == 0:
            db.chunks.delete_many(job.chunks, session=session)
        db.chunks.insert_many(rows, session=session)

    with db.client.start_session() as session:
        session.with_transaction(write)


def finish(db: Database, job: Job, pages: int, error: str | None = None):
    update = {
        "$set": {"status": "failed" if error else "ready", "pages": pages, "error": error},
        "$unset": {"ingestId": "", "indexedChunks": ""},
    }

    def publish(session):
        result = db.documents.update_one(job.active, update, session=session)
        if result.matched_count and error:
            db.chunks.delete_many(job.chunks, session=session)

    with db.client.start_session() as session:
        session.with_transaction(publish)


def delete_document(db: Database, doc_id: ObjectId, user_id: ObjectId) -> bool:
    def remove(session):
        result = db.documents.delete_one({"_id": doc_id, "userId": user_id}, session=session)
        if result.deleted_count:
            db.chunks.delete_many({"docId": doc_id, "userId": user_id}, session=session)
        return bool(result.deleted_count)

    with db.client.start_session() as session:
        return session.with_transaction(remove)
