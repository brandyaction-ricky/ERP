# BRANDYACTION ERP · 연월차 관리 대장

직원별 연차 발생, 사용, 잔여 현황을 관리하는 내부 운영 서비스입니다.

## 주요 기능

- 입사일 기준 연차 자동 계산
- 직원 등록·수정·삭제
- 연차·오전 반차·오후 반차 등록
- 연도·팀·직원 검색
- Supabase 영구 저장
- 공용 접근 비밀번호 보호

## 운영 구성

- Frontend / API: Next.js + Vercel
- Database: Supabase PostgreSQL
- Design: BRANDYACTION Design System

## 환경 변수

`.env.example`의 네 값을 Vercel 환경 변수로 등록합니다. `SUPABASE_SERVICE_ROLE_KEY`, `ERP_ACCESS_PASSWORD`, `ERP_AUTH_SECRET`은 브라우저에 노출하면 안 됩니다.

## 데이터베이스

Supabase SQL Editor에서 `supabase/migrations/0001_erp_leave_schema.sql`을 실행합니다.
