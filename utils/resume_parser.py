"""
简历解析工具类
"""
from markitdown import MarkItDown
from typing import Optional
import os


class ResumeParser:
    """简历解析器"""

    def __init__(self):
        """初始化简历解析器"""
        self.md = MarkItDown()

    def parse_resume(self, file_path: str) -> Optional[str]:
        """
        解析简历文件为文本

        Args:
            file_path: 简历文件路径

        Returns:
            解析后的文本内容，如果解析失败返回None
        """
        try:
            # 检查文件是否存在
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"简历文件不存在: {file_path}")

            # 使用markitdown解析文件
            result = self.md.convert(file_path)

            # 返回解析后的文本内容
            return result.text_content if result else None

        except Exception as e:
            raise Exception(f"简历解析失败: {str(e)}")

    def parse_multiple_resumes(self, file_paths: list) -> dict:
        """
        批量解析多个简历文件

        Args:
            file_paths: 简历文件路径列表

        Returns:
            字典，key为文件路径，value为解析结果或错误信息
        """
        results = {}

        for file_path in file_paths:
            try:
                text = self.parse_resume(file_path)
                results[file_path] = {
                    "success": True,
                    "text": text
                }
            except Exception as e:
                results[file_path] = {
                    "success": False,
                    "error": str(e)
                }

        return results
