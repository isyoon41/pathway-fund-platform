-- ============================================================
-- admin@pathwaypartners.one 계정 자동 admin 역할 부여 트리거
-- ============================================================
-- profiles 테이블에 새 행이 INSERT될 때마다 실행됩니다.
-- auth.users 의 email이 admin@pathwaypartners.one이면
-- role을 자동으로 'admin'으로 설정합니다.

CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- auth.users에서 이메일 조회
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.id;

  IF user_email = 'admin@pathwaypartners.one' THEN
    NEW.role := 'admin';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 트리거가 있으면 제거 후 재생성
DROP TRIGGER IF EXISTS trg_auto_assign_admin_role ON public.profiles;

CREATE TRIGGER trg_auto_assign_admin_role
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_admin_role();

-- ============================================================
-- 이미 admin@pathwaypartners.one 계정이 존재하는 경우 수동 업데이트
-- ============================================================
UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin@pathwaypartners.one'
);
