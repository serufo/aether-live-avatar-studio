import React from 'react';
import { HeartHandshake, PhoneCall, ShieldAlert, X } from 'lucide-react';
import { PacificSupportContact } from '../../types/pacificR';

interface Props {
  open: boolean;
  onClose: () => void;
  contacts: PacificSupportContact[];
}

export const SupportContactsModal: React.FC<Props> = ({ open, onClose, contacts }) => {
  if (!open) return null;

  return (
    <div
      className="pr-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pr-support-modal-title"
      onClick={onClose}
    >
      <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          <h2 id="pr-support-modal-title" className="pr-card-title" style={{ marginBottom: 0 }}>
            <HeartHandshake size={20} color="#b42318" />
            <span>Apoio Humano e Serviços de Saúde Mental</span>
          </h2>
          <button
            type="button"
            className="pr-btn pr-btn-sm"
            onClick={onClose}
            aria-label="Fechar canais de apoio humano"
          >
            <X size={15} />
            <span>Fechar</span>
          </button>
        </div>

        <div
          className="pr-tcle-item"
          style={{
            background: '#fef2f2',
            borderColor: '#f5b4af',
            color: '#7a271a',
            marginBottom: '14px',
          }}
        >
          <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Transparência e segurança:</strong> o sistema PACIFIC-R é uma Inteligência
            Artificial educativa e sua detecção automática de situações críticas <strong>não é infalível</strong>. Se você estiver passando por sofrimento intenso ou desconforto,
            interrompa a sessão e procure diretamente um dos serviços humanos abaixo.
          </div>
        </div>

        {contacts.map((contact) => (
          <div
            key={contact.id}
            className={`pr-contact-card ${contact.scope === 'emergency' ? 'emergency' : ''}`}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ fontSize: '0.92rem' }}>{contact.name}</strong>
              <span
                className={`pr-badge ${
                  contact.scope === 'emergency'
                    ? 'pr-badge-crimson'
                    : contact.scope === 'public_health'
                    ? 'pr-badge-teal'
                    : 'pr-badge-slate'
                }`}
              >
                {contact.scope === 'emergency'
                  ? 'Urgência / 24h'
                  : contact.scope === 'public_health'
                  ? 'Rede Pública (SUS)'
                  : 'Institucional ICEX'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '6px',
                fontWeight: 700,
                color: contact.scope === 'emergency' ? '#b42318' : '#0f6260',
                fontSize: '0.88rem',
              }}
            >
              <PhoneCall size={14} />
              <span>{contact.channel}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#435b57', marginTop: '4px' }}>
              <strong>Disponibilidade:</strong> {contact.availability}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#435b57', marginTop: '4px' }}>
              {contact.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
