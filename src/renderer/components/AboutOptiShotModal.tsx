import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '@renderer/hooks/useTranslation'
import { getAboutContent } from '@renderer/content/about'
import type { AboutBlock } from '@renderer/content/about'

interface Props {
  onClose: () => void
}

export function AboutOptiShotModal({ onClose }: Props) {
  const { t, language } = useTranslation()
  const content = useMemo(() => getAboutContent(language), [language])
  const [activeId, setActiveId] = useState(content.sections[0]?.id ?? '')
  const bodyRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Track which section is most visible while scrolling.
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveId(visible.target.id)
      },
      { root, rootMargin: '0px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    Object.values(sectionRefs.current).forEach((el) => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [content.sections])

  const handleNavClick = (id: string) => {
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      data-testid="about-modal"
      className="fixed inset-0 z-50 bg-surface-primary flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 h-14 border-b border-border shrink-0">
        <div>
          <h2 id="about-title" className="text-base font-heading font-bold text-foreground-primary">
            {t('about.title')}
          </h2>
          <p className="text-xs text-foreground-muted">{t('about.subtitle')}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={t('about.close')}
          data-testid="about-close"
          className="p-2 rounded-lg text-foreground-muted hover:bg-surface-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body: sidebar + scrollable content */}
      <div className="flex-1 min-h-0 flex">
        <nav
          aria-label={t('about.title')}
          data-testid="about-nav"
          className="w-60 shrink-0 border-r border-border overflow-y-auto py-4"
        >
          <ul className="space-y-0.5 px-3">
            {content.sections.map((section) => {
              const isActive = activeId === section.id
              return (
                <li key={section.id}>
                  <button
                    onClick={() => handleNavClick(section.id)}
                    data-testid={`about-nav-${section.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-foreground-secondary hover:bg-surface-secondary'
                    }`}
                  >
                    {section.title}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div ref={bodyRef} className="flex-1 overflow-y-auto">
          <div className="max-w-[760px] mx-auto px-10 py-8 space-y-12">
            <p className="text-base leading-relaxed text-foreground-secondary">
              {content.intro}
            </p>

            {content.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                ref={(el) => { sectionRefs.current[section.id] = el }}
                className="scroll-mt-4 space-y-4"
              >
                <h3 className="text-2xl font-heading font-bold text-foreground-primary border-b border-border pb-2">
                  {section.title}
                </h3>
                {section.blocks.map((block, i) => (
                  <BlockRenderer key={i} block={block} />
                ))}
              </section>
            ))}

            <div className="h-16" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  )
}

function BlockRenderer({ block }: { block: AboutBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="text-sm leading-relaxed text-foreground-secondary">{block.text}</p>
    case 'heading':
      return <h4 className="text-base font-semibold text-foreground-primary pt-2">{block.text}</h4>
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground-secondary marker:text-primary">
          {block.items.map((item, i) => <li key={i} className="leading-relaxed">{item}</li>)}
        </ul>
      )
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-foreground-primary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-border">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-foreground-secondary align-top">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}
