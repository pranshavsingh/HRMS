-- Migration 029: Centralized Reverse Geocoding Location Cache
CREATE TABLE IF NOT EXISTS location_cache (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lat_key DECIMAL(9, 4) NOT NULL,
  lng_key DECIMAL(9, 4) NOT NULL,
  original_lat DECIMAL(10, 7) NOT NULL,
  original_lng DECIMAL(10, 7) NOT NULL,
  formatted_address VARCHAR(512) NOT NULL,
  short_name VARCHAR(255) NULL,
  locality VARCHAR(160) NULL,
  sub_locality VARCHAR(160) NULL,
  city VARCHAR(160) NULL,
  district VARCHAR(160) NULL,
  state VARCHAR(160) NULL,
  country VARCHAR(160) NULL,
  postal_code VARCHAR(32) NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'nominatim',
  resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_location_cache_coords (lat_key, lng_key),
  INDEX idx_location_cache_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
