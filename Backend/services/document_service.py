import pdfplumber
from docx import Document
import io
from typing import List

class DocumentService:
    @staticmethod
    def extract_text_from_pdf(file_bytes: bytes) -> str:
        text = ""
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                # Limit to first 10 pages for better context coverage
                max_pages = min(10, len(pdf.pages))
                for i in range(max_pages):
                    page = pdf.pages[i]
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            print(f"Error extracting PDF: {e}")
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
            if filename.lower().endswith(".pdf"):
                combined_text += f"\n--- Contenu de {filename} ---\n"
                combined_text += cls.extract_text_from_pdf(content)
            elif filename.lower().endswith(".docx"):
                combined_text += f"\n--- Contenu de {filename} ---\n"
                combined_text += cls.extract_text_from_docx(content)
            elif filename.lower().endswith((".txt", ".md")):
                combined_text += f"\n--- Contenu de {filename} ---\n"
                combined_text += cls.extract_text_from_txt(content)
        return combined_text
