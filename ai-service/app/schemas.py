from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Id = Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F]{24}$")]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: Text


class Ask(BaseModel):
    user_id: Id
    doc_ids: list[Id] = Field(min_length=1)
    question: Text
    history: list[Turn] = Field(default_factory=list)


class Source(BaseModel):
    chunk_id: Id
    doc_id: Id
    filename: str
    page: int = Field(ge=1)
    text: str
    score: float = Field(ge=0, le=1)
