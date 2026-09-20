-- The OCR confidence of each page, which doc-extract already returns and
-- nothing kept. The review case on the email page shows which page failed and
-- how badly; without this it could only show one number for the whole file.
--
-- Expand only: a new column with a default, so the image this rolls back to
-- still reads every row.
alter table core.documents
  add column if not exists page_confidence real[] not null default '{}';

comment on column core.documents.page_confidence is
  'Mean OCR word confidence per page, 0 to 1, in page order. Empty for a document with a text layer.';
