CREATE DATABASE IF NOT EXISTS `cognitive-style-explanations`;
USE `cognitive-style-explanations`;

CREATE TABLE IF NOT EXISTS `cognitive-style-analysis` (
    id INT NOT NULL AUTO_INCREMENT,
    lesson_id VARCHAR(100) DEFAULT NULL,
    student_id VARCHAR(100) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    source_fingerprint VARCHAR(64) DEFAULT NULL,
    analysis_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    cognitive_style VARCHAR(50) DEFAULT NULL,
    model_signature VARCHAR(64) DEFAULT NULL,
    confidence FLOAT DEFAULT NULL,
    feature_values JSON NOT NULL,
    lime_output JSON DEFAULT NULL,
    shap_output JSON DEFAULT NULL,
    top_features JSON DEFAULT NULL,
    explanation_prompt TEXT DEFAULT NULL,
    human_explanation TEXT DEFAULT NULL,
    explanation_model VARCHAR(100) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX uq_style_source_fingerprint (source_fingerprint),
    INDEX idx_style_lesson_student (lesson_id, student_id),
    INDEX idx_style_session (session_id),
    INDEX idx_style_model_signature (model_signature),
    INDEX idx_style_status (analysis_status)
);
