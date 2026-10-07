package analytics

import "testing"

func TestPipelineOwnerMatches(t *testing.T) {
	tests := []struct {
		name      string
		callerUID string
		ownerUID  string
		want      bool
	}{
		{name: "owner may read", callerUID: "firebase-owner", ownerUID: "firebase-owner", want: true},
		{name: "different user denied", callerUID: "firebase-attacker", ownerUID: "firebase-owner", want: false},
		{name: "missing caller fails closed", callerUID: "", ownerUID: "firebase-owner", want: false},
		{name: "missing owner fails closed", callerUID: "firebase-attacker", ownerUID: "", want: false},
		{name: "both missing fails closed", callerUID: "", ownerUID: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := pipelineOwnerMatches(tt.callerUID, tt.ownerUID); got != tt.want {
				t.Fatalf("pipelineOwnerMatches(%q, %q) = %v, want %v", tt.callerUID, tt.ownerUID, got, tt.want)
			}
		})
	}
}
