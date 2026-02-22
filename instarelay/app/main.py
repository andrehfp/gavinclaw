from fastapi import FastAPI, HTTPException, BackgroundTasks

from .models import (
    PublishPhotoRequest,
    PublishCarouselRequest,
    CommentsInboxRequest,
    CommentsReplyRequest,
    AnalyticsSummaryRequest,
    JobResponse,
    JobDetail,
)
from .store import init_db, create_job, get_job
from .runner import run_job

app = FastAPI(title="InstaRelay MVP API", version="0.1.0")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "instarelay-api", "version": "0.1.0"}


def enqueue(background_tasks: BackgroundTasks, job_type: str, workspace_id: str, account_name: str, payload: dict) -> JobResponse:
    job_id = create_job(workspace_id, account_name, job_type, payload)
    background_tasks.add_task(run_job, job_id, job_type, payload)
    return JobResponse(job_id=job_id, status="pending")


@app.post("/jobs/publish/photo", response_model=JobResponse)
def publish_photo(req: PublishPhotoRequest, background_tasks: BackgroundTasks) -> JobResponse:
    return enqueue(background_tasks, "publish.photo", req.workspace_id, req.account_name, req.model_dump())


@app.post("/jobs/publish/carousel", response_model=JobResponse)
def publish_carousel(req: PublishCarouselRequest, background_tasks: BackgroundTasks) -> JobResponse:
    return enqueue(background_tasks, "publish.carousel", req.workspace_id, req.account_name, req.model_dump())


@app.post("/jobs/comments/inbox", response_model=JobResponse)
def comments_inbox(req: CommentsInboxRequest, background_tasks: BackgroundTasks) -> JobResponse:
    return enqueue(background_tasks, "comments.inbox", req.workspace_id, req.account_name, req.model_dump())


@app.post("/jobs/comments/reply", response_model=JobResponse)
def comments_reply(req: CommentsReplyRequest, background_tasks: BackgroundTasks) -> JobResponse:
    return enqueue(background_tasks, "comments.reply", req.workspace_id, req.account_name, req.model_dump())


@app.post("/jobs/analytics/summary", response_model=JobResponse)
def analytics_summary(req: AnalyticsSummaryRequest, background_tasks: BackgroundTasks) -> JobResponse:
    return enqueue(background_tasks, "analytics.summary", req.workspace_id, req.account_name, req.model_dump())


@app.get("/jobs/{job_id}", response_model=JobDetail)
def job_detail(job_id: str) -> JobDetail:
    data = get_job(job_id)
    if not data:
        raise HTTPException(status_code=404, detail="job not found")
    return JobDetail(**data)
