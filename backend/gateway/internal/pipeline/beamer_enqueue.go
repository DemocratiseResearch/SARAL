package pipeline

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	goredis "github.com/redis/go-redis/v9"

	"github.com/saral/gateway/internal/models"
	redisx "github.com/saral/gateway/internal/redis"
	"github.com/saral/gateway/internal/storage"
)

const DefaultPPTTemplate = "template-saral"

type BeamerJobOpts struct {
	OutputFormat          string
	PPTTemplate           string
	TemplateGCSPath       string
	SlideExportPDFPrimary bool
}

func enqueueBeamerCompile(ctx context.Context, rdb *goredis.Client, runID, stepID uuid.UUID, run *models.Run, scriptPath, extractedPath string, o BeamerJobOpts) error {
	values := redisx.JobData{
		"run_id":             runID.String(),
		"step_id":            stepID.String(),
		"paper_id":           run.PaperID.String(),
		"user_id":            run.UserID.String(),
		"script_gcs_path":    scriptPath,
		"extracted_gcs_path": extractedPath,
		"output_format":      o.OutputFormat,
		"ppt_template":       o.PPTTemplate,
	}
	if o.TemplateGCSPath != "" {
		values["template_gcs_path"] = o.TemplateGCSPath
	}
	if o.SlideExportPDFPrimary {
		values["slide_export_pdf_primary"] = "true"
	}
	_, err := redisx.EnqueueJob(ctx, rdb, redisx.StreamBeamer, values)
	return err
}


func patchStoredScriptJSON(ctx context.Context, gcsPath string, patch map[string]interface{}) error {
	if len(patch) == 0 {
		return nil
	}
	rawScript, err := storage.DownloadJSON(ctx, gcsPath)
	if err != nil {
		return err
	}
	var scriptMap map[string]interface{}
	if err := json.Unmarshal(rawScript, &scriptMap); err != nil {
		return err
	}
	for k, v := range patch {
		if s, ok := v.(string); ok && s == "" {
			continue
		}
		scriptMap[k] = v
	}
	updated, err := json.Marshal(scriptMap)
	if err != nil {
		return err
	}
	key := storage.ExtractKey(gcsPath)
	_, err = storage.UploadBytes(ctx, updated, key, "application/json")
	return err
}
