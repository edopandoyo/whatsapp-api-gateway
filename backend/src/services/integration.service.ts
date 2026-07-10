import { database } from '../config/database';
import { apiKeyService } from './apiKey.service';
import { authService } from './auth.service';

export interface VendorIntegration {
    id: string;
    vendorId: string;
    vendorSource: string;
    vendorName?: string;
    vendorEmail?: string;
    waUserId?: string;
    apiKeyId?: string;
    apiKey?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface RegisterVendorRequest {
    vendorId: string;
    vendorSource: string;
    vendorName?: string;
    vendorEmail?: string;
}

export interface RegisterVendorResponse {
    integrationId: string;
    apiKey: string;
    userId: string;
    isNew: boolean;
}

class IntegrationService {
    /**
     * Register or get existing vendor integration
     * Auto-provisions a WA Gateway user and API key for external vendor
     */
    async registerVendor(req: RegisterVendorRequest): Promise<RegisterVendorResponse> {
        const { vendorId, vendorSource, vendorName, vendorEmail } = req;

        if (!vendorId || !vendorSource) {
            throw new Error('vendorId and vendorSource are required');
        }

        // Check if integration already exists
        const existing = await this.getIntegration(vendorId, vendorSource);
        if (existing && existing.apiKeyId) {
            // Get the existing API key value
            const apiKey = await apiKeyService.getApiKeyById(existing.apiKeyId);
            if (apiKey && apiKey.isActive) {
                console.log(`[Integration] Vendor integration found: ${vendorSource}:${vendorId}`);
                return {
                    integrationId: existing.id,
                    apiKey: apiKey.key,
                    userId: existing.waUserId!,
                    isNew: false,
                };
            }
            // API key inactive or not found — create new one
            console.warn(`[Integration] Vendor integration exists but API key invalid, creating new: ${vendorSource}:${vendorId}`);
        }

        // Auto-create user for this vendor
        const email = vendorEmail || `${vendorSource}-${vendorId}@integration.masedo.my.id`;
        const password = this.generateSecurePassword();
        const name = vendorName || `${vendorSource} Vendor ${vendorId.substring(0, 8)}`;

        let userId: string;

        try {
            // Try to register a new user
            const user = await authService.register({
                email,
                password,
                name,
            });
            userId = user.id;
            console.log(`[Integration] Auto-created user for vendor: ${vendorSource}:${vendorId} → ${email}`);
        } catch (error: any) {
            // If user already exists (email conflict), get or create integration with existing user
            if (error.message && error.message.includes('already')) {
                console.warn(`[Integration] User already exists for vendor, attempting to link: ${vendorSource}:${vendorId}`);
                // Try to find user by email
                const user = await authService.getUserByEmail(email);
                if (!user) {
                    throw new Error(`Failed to create or find user for vendor integration`);
                }
                userId = user.id;
            } else {
                throw error;
            }
        }

        // Create API key for the user
        const apiKey = await apiKeyService.createApiKey(userId, {
            name: `${vendorSource} Integration Key`,
        });

        // Create or update integration record
        const integrationId = await this.upsertIntegration({
            vendorId,
            vendorSource,
            vendorName: name,
            vendorEmail: email,
            waUserId: userId,
            apiKeyId: apiKey.id,
        });

        console.log(`[Integration] Vendor integration created: ${vendorSource}:${vendorId} → user ${userId}`);

        return {
            integrationId,
            apiKey: apiKey.key,
            userId,
            isNew: true,
        };
    }

    /**
     * Get integration by vendor ID and source
     */
    async getIntegration(vendorId: string, vendorSource: string): Promise<VendorIntegration | null> {
        const query = `
      SELECT id, vendor_id, vendor_source, vendor_name, vendor_email,
             wa_user_id, api_key_id, is_active, created_at, updated_at
      FROM vendor_integrations
      WHERE vendor_id = $1 AND vendor_source = $2
      LIMIT 1
    `;
        const result = await database.query(query, [vendorId, vendorSource]);
        if (result.rows.length === 0) return null;
        return this.mapRow(result.rows[0]);
    }

    /**
     * Get integration by WA user ID
     */
    async getIntegrationByUserId(waUserId: string): Promise<VendorIntegration | null> {
        const query = `
      SELECT id, vendor_id, vendor_source, vendor_name, vendor_email,
             wa_user_id, api_key_id, is_active, created_at, updated_at
      FROM vendor_integrations
      WHERE wa_user_id = $1
      LIMIT 1
    `;
        const result = await database.query(query, [waUserId]);
        if (result.rows.length === 0) return null;
        return this.mapRow(result.rows[0]);
    }

    /**
     * List all integrations (admin only)
     */
    async listIntegrations(source?: string): Promise<VendorIntegration[]> {
        let query = `
      SELECT id, vendor_id, vendor_source, vendor_name, vendor_email,
             wa_user_id, api_key_id, is_active, created_at, updated_at
      FROM vendor_integrations
    `;
        const params: any[] = [];
        if (source) {
            query += ` WHERE vendor_source = $1`;
            params.push(source);
        }
        query += ` ORDER BY created_at DESC`;
        const result = await database.query(query, params);
        return result.rows.map((row: any) => this.mapRow(row));
    }

    /**
     * Deactivate integration
     */
    async deactivateIntegration(integrationId: string): Promise<void> {
        const query = `
      UPDATE vendor_integrations
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `;
        await database.query(query, [integrationId]);
        console.log(`[Integration] Deactivated: ${integrationId}`);
    }

    /**
     * Delete integration
     */
    async deleteIntegration(integrationId: string): Promise<void> {
        const query = `DELETE FROM vendor_integrations WHERE id = $1`;
        await database.query(query, [integrationId]);
        console.log(`[Integration] Deleted: ${integrationId}`);
    }

    /**
     * Create or update integration record
     */
    private async upsertIntegration(data: {
        vendorId: string;
        vendorSource: string;
        vendorName: string;
        vendorEmail: string;
        waUserId: string;
        apiKeyId: string;
    }): Promise<string> {
        const query = `
      INSERT INTO vendor_integrations (vendor_id, vendor_source, vendor_name, vendor_email, wa_user_id, api_key_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (vendor_id, vendor_source)
      DO UPDATE SET
        wa_user_id = EXCLUDED.wa_user_id,
        api_key_id = EXCLUDED.api_key_id,
        vendor_name = EXCLUDED.vendor_name,
        vendor_email = EXCLUDED.vendor_email,
        is_active = true,
        updated_at = NOW()
      RETURNING id
    `;
        const result = await database.query(query, [
            data.vendorId,
            data.vendorSource,
            data.vendorName,
            data.vendorEmail,
            data.waUserId,
            data.apiKeyId,
        ]);
        return result.rows[0].id;
    }

    /**
     * Generate a secure random password for auto-created users
     */
    private generateSecurePassword(): string {
        const length = 32;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return password;
    }

    /**
     * Map database row to VendorIntegration object
     */
    private mapRow(row: any): VendorIntegration {
        return {
            id: row.id,
            vendorId: row.vendor_id,
            vendorSource: row.vendor_source,
            vendorName: row.vendor_name,
            vendorEmail: row.vendor_email,
            waUserId: row.wa_user_id,
            apiKeyId: row.api_key_id,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

export const integrationService = new IntegrationService();