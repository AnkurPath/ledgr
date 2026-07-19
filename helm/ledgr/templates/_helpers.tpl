{{- define "ledgr.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ledgr.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "ledgr.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "ledgr.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "ledgr.backend.fullname" -}}
{{- printf "%s-backend" (include "ledgr.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ledgr.frontend.fullname" -}}
{{- printf "%s-frontend" (include "ledgr.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ledgr.backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ledgr.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: backend
{{- end -}}

{{- define "ledgr.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ledgr.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end -}}

{{- define "ledgr.cnpg.name" -}}
{{- default "ledgr-db" .Values.cnpg.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ledgr.cnpg.appSecret" -}}
{{- if .Values.backend.databaseSecretName -}}
{{- .Values.backend.databaseSecretName -}}
{{- else -}}
{{- printf "%s-app" (include "ledgr.cnpg.name" .) -}}
{{- end -}}
{{- end -}}

{{- define "ledgr.cnpg.rwService" -}}
{{- printf "%s-rw" (include "ledgr.cnpg.name" .) -}}
{{- end -}}

{{- define "ledgr.backend.secretName" -}}
{{- default (printf "%s-env" (include "ledgr.backend.fullname" .)) .Values.backend.existingSecretName -}}
{{- end -}}
