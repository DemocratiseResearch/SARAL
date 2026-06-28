// Usage:
//
//	go run ./gateway/cmd/seed_avatars -src ./path/to/local/avatars
//
// The -src directory must contain every filename returned by
// models.ReelAvatarFilenames() (today: prof1.png, prof2.png, student1.png,
// student2.png). Picks up STORAGE_BUCKET / STORAGE_EMULATOR_HOST / ENV from
// the environment, same as the rest of the gateway.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"

	"github.com/saral/gateway/internal/models"
	"github.com/saral/gateway/internal/storage"
)

func main() {
	_ = godotenv.Load() // Load (not Overload) so shell env vars take precedence

	src := flag.String("src", "", "directory containing the avatar PNG files to upload")
	flag.Parse()

	if *src == "" {
		log.Fatal("-src is required (directory containing the avatar PNGs)")
	}
	info, err := os.Stat(*src)
	if err != nil {
		log.Fatalf("-src %q not accessible: %v", *src, err)
	}
	if !info.IsDir() {
		log.Fatalf("-src %q is not a directory", *src)
	}

	storage.Init()

	ctx := context.Background()
	filenames := models.ReelAvatarFilenames()
	log.Printf("seeding %d avatar PNGs from %s into %s", len(filenames), *src, models.ReelAvatarGCSPrefix)

	for _, name := range filenames {
		localPath := filepath.Join(*src, name)
		data, err := os.ReadFile(localPath)
		if err != nil {
			log.Fatalf("read %s: %v", localPath, err)
		}
		key := models.ReelAvatarGCSPrefix + name
		gsPath, err := storage.UploadBytes(ctx, data, key, "image/png")
		if err != nil {
			log.Fatalf("upload %s: %v", key, err)
		}
		fmt.Printf("uploaded %s -> %s (%d bytes)\n", localPath, gsPath, len(data))
	}

	fmt.Println("seed complete.")
}
