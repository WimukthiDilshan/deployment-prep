CREATE DATABASE IF NOT EXISTS `lime-data`;
USE `lime-data`;

CREATE TABLE IF NOT EXISTS `cognitive-load` (
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
    predicted_cognitive_load VARCHAR(20) NOT NULL,
    predicted_score INT NOT NULL,
    confidence FLOAT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_cognitive_load_student_lesson (student_id, lesson_id),
    INDEX idx_cognitive_load_session_minute (session_id, minute_index)
);
