-- 1. SCHOOLS Tablosuna Abonelik Sütunlarını Ekle
-- Bu kod, okulların abonelik durumunu ve deneme süresi bitiş tarihini takip eder.

ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'TRIALING',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days');

-- 2. USER_PROFILES Tablosuna Rol ve Okul ID Bilgilerini Doğrula
-- Kullanıcıların yetkilerini (İdareci/Öğretmen) ve hangi okula ait olduklarını belirler.

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'İDARECİ',
ADD COLUMN IF NOT EXISTS school_id TEXT;

ALTER TABLE students
ADD COLUMN IF NOT EXISTS target_school TEXT,
ADD COLUMN IF NOT EXISTS score_goal DECIMAL(5,2);

-- 3. Ödeme Geçmişi İçin Opsiyonel Tablo (İleride lazım olabilir)
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT,
    amount DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    status TEXT, -- 'SUCCESS', 'FAILED'
    transaction_id TEXT, -- iyzico/Stripe'dan dönen ID
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- AI TELAFİ MOTORU - SINAV SİSTEMİ TABLOLARI
-- =====================================================

-- 4. Sınav Paketi Tablosu
-- LGS Deneme 1, TYT Denemesi Kasım gibi sınav paketlerini tanımlar.
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL,
    name TEXT NOT NULL,
    exam_type TEXT NOT NULL CHECK (exam_type IN ('LGS', 'TYT', 'AYT', 'YDT', 'TARAMA_11')),
    target_grade INTEGER,
    applied_date DATE,
    wrong_penalty_ratio DECIMAL(5,4) DEFAULT 0.3333,
    status TEXT DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE')),
    class_ids TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Sınav Oturumu Tablosu
-- LGS: Sözel/Sayısal | YKS: TYT/AYT oturum ayrımı
CREATE TABLE IF NOT EXISTS exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    session_name TEXT NOT NULL CHECK (session_name IN ('SÖZEL', 'SAYISAL', 'TYT', 'AYT', 'YDT', 'TARAMA')),
    duration_minutes INTEGER,
    question_count INTEGER,
    session_order INTEGER NOT NULL DEFAULT 1
);

-- 6. Kazanımlar Tablosu
-- MEB müfredatı kazanımları; LGS için ders bazlı, YKS için test bazlı ayrıştırılır.
CREATE TABLE IF NOT EXISTS objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL,
    code TEXT,
    description TEXT NOT NULL,
    subject TEXT NOT NULL,
    test_context TEXT CHECK (test_context IN ('TYT', 'AYT', 'YDT') OR test_context IS NULL),
    grade INTEGER,
    unit TEXT,
    topic TEXT
);

-- 7. Sınav Soruları Tablosu
CREATE TABLE IF NOT EXISTS exam_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    subject TEXT NOT NULL,
    correct_answer TEXT,
    point_weight DECIMAL(6,4) DEFAULT 1.0,
    objective_id UUID REFERENCES objectives(id),
    ai_analysis_status TEXT DEFAULT 'PENDING' CHECK (ai_analysis_status IN ('PENDING', 'COMPLETED', 'FAILED')),
    ai_confidence_score DECIMAL(4,3),
    question_text TEXT
);

-- 8. Öğrenci Yanıtları Tablosu
CREATE TABLE IF NOT EXISTS student_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL,
    question_id UUID NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    given_answer TEXT,
    is_correct BOOLEAN,
    is_empty BOOLEAN DEFAULT FALSE,
    raw_score DECIMAL(8,4),
    lost_points DECIMAL(8,4),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- İndeksler (performans)
CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam_id ON exam_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_session_id ON exam_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_student_responses_student_id ON student_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_student_responses_question_id ON student_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_objectives_school_id ON objectives(school_id);

-- Upsert için unique kısıt (session başına soru numarası benzersiz)
ALTER TABLE exam_questions ADD CONSTRAINT IF NOT EXISTS uq_session_question UNIQUE (session_id, question_number);
-- Öğrenci başına her soru için tek yanıt
ALTER TABLE student_responses ADD CONSTRAINT IF NOT EXISTS uq_student_question UNIQUE (student_id, question_id);
-- Migration: class_ids sütunu ekle (tablo zaten varsa)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_ids TEXT[];
