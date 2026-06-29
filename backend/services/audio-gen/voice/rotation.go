package voice

import (
	"context"
	"fmt"

	goredis "github.com/redis/go-redis/v9"
)

var (
	malePool   = []string{"aditya", "shubh", "aayan"}
	femalePool = []string{"simran", "roopa", "ishita"}
)

func poolForGender(gender string) []string {
	if gender == "male" {
		return malePool
	}
	return femalePool
}


func Next(ctx context.Context, rdb *goredis.Client, gender string) (string, error) {
	pool := poolForGender(gender)
	key := fmt.Sprintf("saral:voice:%s:counter", gender)
	idx, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return pool[0], nil // safe fallback
	}
	return pool[int(idx-1)%len(pool)], nil
}


func DifferentFrom(gender, avoid string) string {
	pool := poolForGender(gender)
	for _, candidate := range pool {
		if candidate != avoid {
			return candidate
		}
	}
	if len(pool) == 0 {
		return ""
	}
	return pool[0]
}
