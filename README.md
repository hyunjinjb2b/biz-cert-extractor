<<<<<<< HEAD
# 사업자등록증 정보 추출기

사업자등록증 이미지, PDF, ZIP 파일을 업로드하면 AI OCR로 거래처 등록용 정보를 추출하고 엑셀로 다운로드할 수 있는 로컬 웹 애플리케이션입니다.

## 실행 방법

1. `.env.example`을 참고해 `.env` 파일을 준비합니다.
2. `UBION_LITELLM_KEY`에 실제 LiteLLM API 키를 입력합니다.
3. `UBION_VISION_MODEL`에 사용할 비전 모델명을 입력합니다. 기본 권장값은 `gpt-4o`입니다.
4. 우편번호 보정이 필요하면 `KAKAO_REST_API_KEY`에 카카오 REST API 키를 입력합니다.
5. `run_local.bat`을 실행한 뒤 브라우저에서 `http://localhost:3000`으로 접속합니다.

## 환경 변수

```env
APP_URL=http://localhost:3000
KAKAO_REST_API_KEY=PUT_YOUR_KAKAO_REST_API_KEY_HERE
UBION_LITELLM_URL=http://192.168.50.119:4000
UBION_LITELLM_KEY=PUT_YOUR_UBION_LITELLM_KEY_HERE
UBION_VISION_MODEL=gpt-4o
```

## 주의

- `.env`에는 실제 API 키가 들어가므로 GitHub에 올리지 않습니다.
- GitHub에는 `.env.example`만 올립니다.
- 카카오 키는 JavaScript 키가 아니라 REST API 키를 사용해야 합니다.
=======
\# 사업자등록증 정보 추출기 실행 방법



1\. `.env` 파일을 엽니다.

2\. `GEMINI\_API\_KEY`의 임시키를 실제 Gemini API 키로 교체합니다.

3\. `KAKAO\_REST\_API\_KEY`의 임시키를 실제 카카오 REST API 키로 교체합니다.

4\. `run\_local.bat` 파일을 더블클릭합니다.

5\. 브라우저에서 `http://localhost:3000`으로 접속합니다.



주의:

\- 공유용 파일에는 보안을 위해 임시키가 들어 있습니다.

\- 실제 사용 전에는 반드시 실제 API 키로 교체해야 합니다.

\- 카카오 키는 JavaScript 키가 아니라 REST API 키를 입력해야 합니다.

>>>>>>> a2cb1beba651ff24be5aacfd9923ff5e28ef9ecd
