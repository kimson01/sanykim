import React, { useEffect, useState } from 'react';
import { adminAPI } from '../../api/client';
import { useToast } from '../../components/ui';

const SAMPLE_TERMS = `Organizer Terms & Conditions (Sample)

1. Organizer Responsibilities
- Provide accurate event details, pricing, venue/location, and schedule.
- Keep attendee communications professional and timely.
- Comply with applicable laws and regulations in Kenya.

2. Ticketing & Payments
- Ticket sales are processed through Sany Adventures payment rails.
- Platform commission applies to every successful paid order.
- Any manual refunds done off-platform must be mirrored on-platform by the organizer/admin.

3. Event Delivery
- Organizer must deliver the event as advertised.
- Major changes (date, location, cancellation) must be communicated to attendees immediately.

4. Prohibited Content & Conduct
- No fraudulent, illegal, or misleading events.
- No misuse of attendee personal data.

5. Account & Compliance
- KYC/business verification information must be truthful.
- Repeated policy violations may lead to suspension or permanent removal.
`;

const SAMPLE_HOMEPAGE_CMS = {
  cms_home_eyebrow: 'Events across East Africa',
  cms_home_title: 'Your next experience',
  cms_home_title_highlight: 'starts here',
  cms_home_subtitle: 'Discover, book and attend the best events — music, tech, food, business and more.',
  cms_home_primary_cta_label: 'Explore Events',
  cms_home_primary_cta_url: '/',
  cms_home_secondary_cta_label: 'Become an Organizer',
  cms_home_secondary_cta_url: '/register',
  cms_footer_tagline: 'Adventure Ticketing for East Africa',
};

const parseBool = (v, fallback = true) => {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).toLowerCase() === 'true';
};

const asInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    adminAPI.settings()
      .then((r) => setSettings(r.data.data || {}))
      .catch((err) => {
        setSettings({});
        toast(err.response?.data?.message || 'Failed to load settings', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminAPI.updateSettings(settings);
      toast('Settings saved');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key, value) => setSettings((s) => ({ ...s, [key]: value }));

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontFamily: 'Syne', fontWeight: 600, marginBottom: 2, fontSize: 16 }}>Platform Settings</div>

      <div className="responsive-grid-2">
        <div className="form-group">
          <label className="form-label">Platform Name</label>
          <input className="input" value={settings.platform_name || ''} onChange={(e) => setField('platform_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Support Email</label>
          <input className="input" type="email" value={settings.support_email || ''} onChange={(e) => setField('support_email', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Commission Rate (%)</label>
          <input className="input" type="number" min={0} max={100} value={settings.commission_rate || ''} onChange={(e) => setField('commission_rate', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Currency Code</label>
          <input className="input" value={settings.currency || ''} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Security Controls</div>
        <div className="responsive-grid-2">
          <div className="form-group">
            <label className="form-label">Require Email Verification</label>
            <select
              className="select"
              value={String(parseBool(settings.security_enforce_email_verification, true))}
              onChange={(e) => setField('security_enforce_email_verification', e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Require Organizer KYC Before Publish</label>
            <select
              className="select"
              value={String(parseBool(settings.security_require_organizer_kyc, true))}
              onChange={(e) => setField('security_require_organizer_kyc', e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Auto-block High-Risk Purchase Patterns</label>
            <select
              className="select"
              value={String(parseBool(settings.security_fraud_auto_block, true))}
              onChange={(e) => setField('security_fraud_auto_block', e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Max Orders Per IP / Hour</label>
            <input
              className="input"
              type="number"
              min={1}
              max={1000}
              value={asInt(settings.security_max_orders_per_hour_per_ip, 20)}
              onChange={(e) => setField('security_max_orders_per_hour_per_ip', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Customer Trust</div>
        <div className="responsive-grid-2">
          <div className="form-group">
            <label className="form-label">Show Buyer Protection Banner</label>
            <select
              className="select"
              value={String(parseBool(settings.trust_show_buyer_protection, true))}
              onChange={(e) => setField('trust_show_buyer_protection', e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Show Trust Badges</label>
            <select
              className="select"
              value={String(parseBool(settings.trust_show_trust_badges, true))}
              onChange={(e) => setField('trust_show_trust_badges', e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">Buyer Protection Copy</label>
          <textarea
            className="textarea"
            value={settings.trust_buyer_protection_text || ''}
            onChange={(e) => setField('trust_buyer_protection_text', e.target.value)}
            style={{ minHeight: 100 }}
            placeholder="Short trust copy shown on checkout."
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 15 }}>Homepage CMS</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Manage public homepage copy and call-to-action links without editing code.
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSettings((current) => ({ ...current, ...SAMPLE_HOMEPAGE_CMS }))}
          >
            Load Homepage Defaults
          </button>
        </div>

        <div className="responsive-grid-2">
          <div className="form-group">
            <label className="form-label">Hero Eyebrow</label>
            <input className="input" value={settings.cms_home_eyebrow || ''} onChange={(e) => setField('cms_home_eyebrow', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Footer Tagline</label>
            <input className="input" value={settings.cms_footer_tagline || ''} onChange={(e) => setField('cms_footer_tagline', e.target.value)} />
          </div>
        </div>

        <div className="responsive-grid-2" style={{ marginTop: 10 }}>
          <div className="form-group">
            <label className="form-label">Hero Title</label>
            <input className="input" value={settings.cms_home_title || ''} onChange={(e) => setField('cms_home_title', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hero Highlight</label>
            <input className="input" value={settings.cms_home_title_highlight || ''} onChange={(e) => setField('cms_home_title_highlight', e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">Hero Subtitle</label>
          <textarea
            className="textarea"
            value={settings.cms_home_subtitle || ''}
            onChange={(e) => setField('cms_home_subtitle', e.target.value)}
            style={{ minHeight: 100 }}
            placeholder="Supporting copy shown under the homepage headline."
          />
        </div>

        <div className="responsive-grid-2" style={{ marginTop: 10 }}>
          <div className="form-group">
            <label className="form-label">Primary CTA Label</label>
            <input className="input" value={settings.cms_home_primary_cta_label || ''} onChange={(e) => setField('cms_home_primary_cta_label', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Primary CTA URL</label>
            <input className="input" value={settings.cms_home_primary_cta_url || ''} onChange={(e) => setField('cms_home_primary_cta_url', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Secondary CTA Label</label>
            <input className="input" value={settings.cms_home_secondary_cta_label || ''} onChange={(e) => setField('cms_home_secondary_cta_label', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Secondary CTA URL</label>
            <input className="input" value={settings.cms_home_secondary_cta_url || ''} onChange={(e) => setField('cms_home_secondary_cta_url', e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 15 }}>Organizer Terms & Conditions</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setField('terms_and_conditions', SAMPLE_TERMS)}>
            Load Sample Terms
          </button>
        </div>
        <div className="form-group">
          <textarea
            className="textarea"
            value={settings.terms_and_conditions || ''}
            onChange={(e) => setField('terms_and_conditions', e.target.value)}
            placeholder="Enter terms shown to organizers during registration."
            style={{ minHeight: 220 }}
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            This text is shown on the organizer registration agreement step.
          </div>
        </div>
      </div>

      <button className="btn btn-primary" style={{ width: 'fit-content', maxWidth: '100%' }} onClick={save} disabled={saving}>
        <i data-lucide="save" style={{ width: 14, height: 14 }} />
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}
