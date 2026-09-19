from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Read from the environment once at boot. Every name matches the backend's MinIO settings."""

    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "retina"
    minio_use_ssl: bool = False
    # Both languages the bilingual BL word documents use. A missing pack falls back to eng.
    ocr_langs: str = "eng+chi_sim"
    ocr_dpi: int = 220
    render_dpi: int = 110


settings = Settings()
