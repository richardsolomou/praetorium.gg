import type { Datasheet } from '../../server/catalogue'
import { ruleProfileSections } from '../datasheet'
import type { KeywordRule } from './Keyword'
import { RuleText } from './RuleText'

type Props = {
  profiles: Datasheet['profiles']
  rules: KeywordRule[]
  compact?: boolean
}

export function ProfileRules({ profiles, rules, compact = false }: Props) {
  return ruleProfileSections(profiles).map((section) => (
    <section key={section.title}>
      <h2 className="rubric">{section.title}</h2>
      <div className={`mt-2 ${compact ? 'space-y-1.5' : 'grid gap-2 md:grid-cols-2'}`}>
        {section.profiles.map((profile) => (
          <article key={profile.id} className={`border border-edge ${compact ? 'bg-card px-2 py-1.5' : 'bg-panel p-3'}`}>
            {profile.name !== section.title ? <h3 className={compact ? 'text-xs' : 'text-sm'}>{profile.name}</h3> : null}
            {profile.values.map((value) => (
              <div key={value.name}>
                {profile.values.length > 1 && value.name !== profile.name ? <p className="eyebrow mt-1">{value.name}</p> : null}
                <RuleText text={value.value} rules={rules} />
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  ))
}
