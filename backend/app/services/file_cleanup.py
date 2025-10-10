import os
import shutil

def clear_temp_folders():
    base_path = os.path.join(os.path.dirname(__file__), "../..", "temp")
    base_path = os.path.abspath(base_path)
    print("basepath", base_path)
    for folder in os.listdir(base_path):
        folder_path = os.path.join(base_path, folder)
        print("folder_path", folder_path)
        if os.path.isdir(folder_path):
            # Remove all files and subfolders inside each folder
            for item in os.listdir(folder_path):
                item_path = os.path.join(folder_path, item)
                try:
                    if os.path.isfile(item_path) or os.path.islink(item_path):
                        os.remove(item_path)
                    elif os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                except Exception as e:
                    print(f"Failed to delete {item_path}: {e}")
    print("✅ All temp folders cleaned successfully!")


clear_temp_folders()
