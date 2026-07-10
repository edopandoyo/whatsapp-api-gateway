  /**
   * Get API key by ID
   */
  async getApiKeyById(id: string): Promise < ApiKey | null > {
    const query = `
      SELECT id, user_id, key, name, is_active, expires_at, created_at, updated_at
      FROM api_keys
      WHERE id = $1
      LIMIT 1
    `;
    const result = await database.query(query, [id]);
    if(result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
}


