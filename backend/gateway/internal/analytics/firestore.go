package analytics

import (
	"context"
	"log"
	"os"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/option"
)

var fsClient *firestore.Client


func Init(ctx context.Context) error {
	projectID := os.Getenv("FIREBASE_PROJECT_ID")
	credFile := os.Getenv("FIREBASE_CREDENTIALS_FILE")

	// If neither credential nor project ID is set (bare local dev), skip.
	if projectID == "" && credFile == "" {
		log.Println("Analytics/Firestore: no credentials configured — analytics disabled")
		return nil
	}

	var app *firebase.App
	var err error

	if credFile != "" {
		app, err = firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID}, option.WithCredentialsFile(credFile))
	} else {
		app, err = firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	}
	if err != nil {
		return err
	}

	fsClient, err = app.Firestore(ctx)
	if err != nil {
		return err
	}

	log.Printf("Analytics/Firestore initialised (project=%s)", projectID)
	return nil
}

// Client returns the shared Firestore client (may be nil when analytics is disabled).
func Client() *firestore.Client {
	return fsClient
}
