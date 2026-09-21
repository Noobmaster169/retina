from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Read from the environment once at boot. Every name matches the backend's MinIO settings."""

    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "retina"
    minio_use_ssl: bool = False
    # What a page with no text layer is drawn at before a model looks at it. High
    # enough for small print on a bill of lading, low enough not to send a poster.
    render_dpi: int = 160


settings = Settings()
