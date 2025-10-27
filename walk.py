import os
import sys
from pathlib import Path


class DirectoryTree:
    def __init__(
        self,
        root_dir=".",
        show_files=True,
        show_hidden=False,
        max_depth=None,
        output_file=None,
    ):
        self.root_dir = Path(root_dir)
        self.show_files = show_files
        self.show_hidden = show_hidden
        self.max_depth = max_depth
        self.output_file = output_file

    def _should_show(self, path):
        """Определяет, должен ли элемент быть показан"""
        if not self.show_hidden and path.name.startswith("."):
            return False
        # Игнорировать папки venv, __pycache__ и node_modules
        if path.is_dir() and path.name in ["venv", "__pycache__","vue","data","legacy"]:
            return False
        return True

    def _generate_tree(self, directory, prefix="", depth=0, file_handle=None):
        """Генерирует древовидную структуру"""
        if self.max_depth is not None and depth > self.max_depth:
            return

        try:
            contents = [p for p in directory.iterdir() if self._should_show(p)]
            contents.sort(key=lambda x: (x.is_file(), x.name.lower()))
        except PermissionError:
            return

        for i, path in enumerate(contents):
            is_last = i == len(contents) - 1
            current_prefix = "└── " if is_last else "├── "

            line = ""
            if path.is_dir():
                line = f"{prefix}{current_prefix}{path.name}/"
                if file_handle:
                    file_handle.write(line + "\n")
                else:
                    print(line)
                next_prefix = prefix + ("    " if is_last else "│   ")
                self._generate_tree(path, next_prefix, depth + 1, file_handle)
            elif self.show_files:
                # Показываем размер файла
                try:
                    size = path.stat().st_size
                    size_str = self._format_size(size)
                    line = f"{prefix}{current_prefix}{path.name} ({size_str})"
                except (OSError, PermissionError):
                    line = f"{prefix}{current_prefix}{path.name}"

                if file_handle:
                    file_handle.write(line + "\n")
                else:
                    print(line)

    def _format_size(self, size):
        """Форматирует размер файла"""
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.1f}{unit}"
            size /= 1024
        return f"{size:.1f}TB"

    def generate(self):
        """Генерирует и выводит структуру директории"""
        if not self.root_dir.exists():
            print(f"Ошибка: Директория '{self.root_dir}' не существует")
            return

        if not self.root_dir.is_dir():
            print(f"Ошибка: '{self.root_dir}' не является директорией")
            return

        # Верхний корешок - название папки выше
        parent_dir = self.root_dir.parent
        root_name = parent_dir.name if parent_dir.name else str(parent_dir)

        if self.output_file:
            with open(self.output_file, "w", encoding="utf-8") as f:
                f.write(f"{root_name}/\n")
                self._generate_tree(self.root_dir, file_handle=f)
            print(f"Структура сохранена в файл: {self.output_file}")
        else:
            print(f"{root_name}/")
            self._generate_tree(self.root_dir)


def main():
    if len(sys.argv) > 1:
        root_dir = sys.argv[1]  
    else:
        root_dir = "."

    # Создаем объект для генерации дерева
    tree = DirectoryTree(
        root_dir=root_dir,
        show_files=True,  # Показывать файлы
        show_hidden=False,  # Не показывать скрытые файлы
        max_depth=None,  # Без ограничения глубины
        output_file="structure",  # Сохранять в файл
    )

    tree.generate()


if __name__ == "__main__":
    main()
