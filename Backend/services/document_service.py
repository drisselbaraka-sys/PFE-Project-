import pdfplumber
from docx import Document
import io
from typing import List


MAX_TEXT_PER_FILE_CHARS = 120_000
MAX_TOTAL_TEXT_CHARS = 300_000


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    # Nettoyage léger pour éviter d'envoyer du bruit à l'IA
    text = text.replace("\x00", " ")
    lines = [line.strip() for line in text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    return cleaned.strip()


def _truncate_text(text: str, max_chars: int) -> str:
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars]

class DocumentService:
    @staticmethod
    def extract_text_from_pdf(file_bytes: bytes) -> str:
        text = ""
        # 1) pdfplumber
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    try:
                        page_text = page.extract_text()
                    except Exception as e:
                        print(f"[DocService] pdfplumber page.extract_text error: {e}")
                        page_text = None
                    if page_text:
                        text += page_text + "\n"
                    if len(text) >= MAX_TEXT_PER_FILE_CHARS:
                        break
        except Exception as e:
            print(f"[DocService] pdfplumber failed: {e}")

        # 2) pypdf fallback
        if not text:
            try:
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(file_bytes))
                for p in reader.pages:
                    try:
                        p_text = p.extract_text() or ""
                    except Exception:
                        p_text = ""
                    if p_text:
                        text += p_text + "\n"
                    if len(text) >= MAX_TEXT_PER_FILE_CHARS:
                        break
            except Exception as e:
                print(f"[DocService] pypdf fallback failed: {e}")

        # 3) pypdfium2 fallback (souvent robuste sur certains PDF)
        if not text:
            try:
                import pypdfium2 as pdfium
                pdf = pdfium.PdfDocument(io.BytesIO(file_bytes))
                for idx in range(len(pdf)):
                    page = pdf[idx]
                    txtpage = page.get_textpage()
                    p_text = txtpage.get_text_range()
                    if p_text:
                        text += p_text + "\n"
                    if len(text) >= MAX_TEXT_PER_FILE_CHARS:
                        break
            except Exception as e:
                print(f"[DocService] pypdfium2 fallback failed: {e}")

        return _truncate_text(_normalize_text(text), MAX_TEXT_PER_FILE_CHARS)

    @staticmethod
    def extract_text_from_docx(file_bytes: bytes) -> str:
        text = ""
        try:
            doc = Document(io.BytesIO(file_bytes))
            for para in doc.paragraphs:
                text += para.text + "\n"
                if len(text) >= MAX_TEXT_PER_FILE_CHARS:
                    break
        except Exception as e:
            print(f"Error extracting DOCX: {e}")
        return _truncate_text(_normalize_text(text), MAX_TEXT_PER_FILE_CHARS)

    @staticmethod
    def extract_text_from_txt(file_bytes: bytes) -> str:
        decoded = ""
        try:
            decoded = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                decoded = file_bytes.decode("latin-1")
            except Exception:
                decoded = ""
        return _truncate_text(_normalize_text(decoded), MAX_TEXT_PER_FILE_CHARS)

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

            # Concaténation sans exposer les noms de fichiers au modèle
            if extracted:
                combined_text += "\n[DOCUMENT_CONTENT]\n"
                combined_text += extracted
            if len(combined_text) >= MAX_TOTAL_TEXT_CHARS:
                print(f" [DocService] Texte total tronqué à {MAX_TOTAL_TEXT_CHARS} caractères.")
                combined_text = combined_text[:MAX_TOTAL_TEXT_CHARS]
                break

        return _normalize_text(combined_text)
