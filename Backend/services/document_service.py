import pdfplumber
from docx import Document
import io
from typing import List

class DocumentService:
    @staticmethod
    def extract_text_from_pdf(file_bytes: bytes) -> str:
        text = ""
        # First attempt: pdfplumber (works for many PDFs with selectable text)
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages[:10]:
                    try:
                        page_text = page.extract_text()
                    except Exception as e:
                        print(f"[DocService] pdfplumber page.extract_text error: {e}")
                        page_text = None
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            print(f"[DocService] pdfplumber failed: {e}")

        # Fallback: try pypdf extraction if pdfplumber produced nothing
        if not text:
            try:
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(file_bytes))
                for p in reader.pages[:20]:
                    try:
                        p_text = p.extract_text() or ""
                    except Exception:
                        p_text = ""
                    if p_text:
                        text += p_text + "\n"
            except Exception as e:
                print(f"[DocService] pypdf fallback failed: {e}")

        return text

    @staticmethod
    def extract_text_from_docx(file_bytes: bytes) -> str:
        text = ""
        try:
            doc = Document(io.BytesIO(file_bytes))
            # Limit to first 150 paragraphs for better context coverage
            paragraphs = doc.paragraphs[:150]
            for para in paragraphs:
                text += para.text + "\n"
        except Exception as e:
            print(f"Error extracting DOCX: {e}")
        return text

    @staticmethod
    def extract_text_from_txt(file_bytes: bytes) -> str:
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                return file_bytes.decode("latin-1")
            except Exception:
                return ""

    @classmethod
    def process_files(cls, files: List[tuple]) -> str:
        """
        Processes a list of (filename, file_bytes) tuples.
        """
        combined_text = ""
        for filename, content in files:
            extracted = ""
            if filename.lower().endswith(".pdf"):
                extracted = cls.extract_text_from_pdf(content)
            elif filename.lower().endswith(".docx"):
                extracted = cls.extract_text_from_docx(content)
            elif filename.lower().endswith((".txt", ".md")):
                extracted = cls.extract_text_from_txt(content)

            # Log per-file extraction length for debugging
            try:
                print(f" [DocService] Extracted {len(extracted or '')} chars from {filename}")
            except Exception:
                print(f" [DocService] Extracted (len unknown) from {filename}")

            # Preserve previous behaviour of concatenating content (including markers)
            if extracted:
                combined_text += f"\n--- Contenu de {filename} ---\n"
                combined_text += extracted

        return combined_text