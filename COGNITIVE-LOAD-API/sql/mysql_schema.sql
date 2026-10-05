CREATE DATABASE IF NOT EXISTS cognitive_load_db;
USE cognitive_load_db;

CREATE TABLE IF NOT EXISTS raw_interaction_events (
    id BIGINT NOT NULL AUTO_INCREMENT,
    student_id VARCHAR(50) NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) DEFAULT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_time DATETIME NOT NULL,
    video_time DECIMAL(10, 2) DEFAULT NULL,
    from_position DECIMAL(10, 2) DEFAULT NULL,
    to_position DECIMAL(10, 2) DEFAULT NULL,
    event_value VARCHAR(255) DEFAULT NULL,
    question_id VARCHAR(100) DEFAULT NULL,
    is_correct BOOLEAN DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_raw_student_lesson_time (student_id, lesson_id, event_time),
    INDEX idx_raw_session_time (session_id, event_time)
);

CREATE TABLE IF NOT EXISTS feature_windows (
    id BIGINT NOT NULL AUTO_INCREMENT,
    student_id VARCHAR(50) NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) DEFAULT NULL,
    minute_index INT NOT NULL,
    window_start DATETIME DEFAULT NULL,
    window_end DATETIME DEFAULT NULL,
    pause_frequency INT NOT NULL,
    navigation_count_video INT NOT NULL,
    rewatch_segments INT NOT NULL,
    playback_rate_change INT NOT NULL,
    idle_duration_video INT NOT NULL,
    time_on_content INT NOT NULL,
    navigation_count_adaptation INT NOT NULL,
    revisit_frequency INT NOT NULL,
    idle_duration_adaptation INT NOT NULL,
    quiz_response_time INT NOT NULL,
    error_rate FLOAT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_feature_session_minute (student_id, lesson_id, session_id, minute_index),
    INDEX idx_feature_student_lesson_minute (student_id, lesson_id, minute_index),
    INDEX idx_feature_session_window (session_id, window_start, window_end)
);

CREATE TABLE IF NOT EXISTS prediction_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    feature_window_id BIGINT DEFAULT NULL,
    student_id VARCHAR(50) NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) DEFAULT NULL,
    predicted_cognitive_load VARCHAR(20) NOT NULL,
    predicted_score INT NOT NULL,
    confidence FLOAT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_prediction_feature_window
        FOREIGN KEY (feature_window_id) REFERENCES feature_windows(id)
        ON DELETE SET NULL,
    INDEX idx_prediction_student_lesson (student_id, lesson_id),
    INDEX idx_prediction_feature_window (feature_window_id)
);

CREATE TABLE IF NOT EXISTS feature_window_dispatches (
    id BIGINT NOT NULL AUTO_INCREMENT,
    feature_window_id BIGINT DEFAULT NULL,
    student_id VARCHAR(50) NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) DEFAULT NULL,
    minute_index INT NOT NULL,
    window_start DATETIME DEFAULT NULL,
    window_end DATETIME DEFAULT NULL,
    target_service VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_message VARCHAR(1000) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_dispatch_feature_window
        FOREIGN KEY (feature_window_id) REFERENCES feature_windows(id)
        ON DELETE SET NULL,
    INDEX idx_dispatch_window_target (student_id, lesson_id, session_id, window_start, window_end, target_service),
    INDEX idx_dispatch_status (status, created_at)
);
