package pipeline

import "github.com/gin-gonic/gin"


func firebaseIdentityFromContext(c *gin.Context) (firebaseUID, email, provider string) {
	if uid := c.GetHeader("X-User-ID"); uid != "" {
		return uid, uid + "@local.dev", "local"
	}
	return c.MustGet("firebase_uid").(string), c.GetString("email"), c.GetString("provider")
}
