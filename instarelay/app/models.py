from pydantic import BaseModel, Field
from typing import Optional, Any, Dict, List


class BaseJobRequest(BaseModel):
    workspace_id: str = Field(min_length=1)
    account_name: str = Field(min_length=1)


class PublishPhotoRequest(BaseJobRequest):
    file_url: str = Field(min_length=1)
    caption: str = Field(default="")


class PublishCarouselRequest(BaseJobRequest):
    file_urls: List[str] = Field(min_length=2)
    caption: str = Field(default="")


class CommentsInboxRequest(BaseJobRequest):
    days: int = 7
    limit: int = 20


class CommentsReplyRequest(BaseJobRequest):
    comment_id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class AnalyticsSummaryRequest(BaseJobRequest):
    days: int = Field(default=7)


class JobResponse(BaseModel):
    job_id: str
    status: str


class JobDetail(BaseModel):
    id: str
    workspace_id: str
    account_name: str
    job_type: str
    status: str
    request_json: Dict[str, Any]
    result_json: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str
