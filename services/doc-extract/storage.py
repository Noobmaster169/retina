from io import BytesIO
from typing import Protocol

from minio import Minio
from minio.error import S3Error

from settings import Settings


class StorageError(Exception):
    """The object store did not answer or answered with a failure: retryable from the caller's side."""


class NoSuchObject(Exception):
    """The key is not there. Asking again will not change that."""


class Storage(Protocol):
    def get(self, key: str) -> bytes: ...

    def put(self, key: str, data: bytes, content_type: str) -> None: ...


class MinioStorage:
    def __init__(self, settings: Settings):
        self._bucket = settings.minio_bucket
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key or None,
            secret_key=settings.minio_secret_key or None,
            secure=settings.minio_use_ssl,
        )

    def get(self, key: str) -> bytes:
        try:
            response = self._client.get_object(self._bucket, key)
        except S3Error as error:
            if error.code in ("NoSuchKey", "NoSuchBucket"):
                raise NoSuchObject(key) from error
            raise StorageError(str(error)) from error
        except Exception as error:  # noqa: BLE001 - any transport failure is the store being unreachable
            raise StorageError(str(error)) from error
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def put(self, key: str, data: bytes, content_type: str) -> None:
        try:
            self._client.put_object(self._bucket, key, BytesIO(data), len(data), content_type=content_type)
        except Exception as error:  # noqa: BLE001
            raise StorageError(str(error)) from error


class MemoryStorage:
    """For tests: a dict."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def get(self, key: str) -> bytes:
        if key not in self.objects:
            raise NoSuchObject(key)
        return self.objects[key][0]

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)
