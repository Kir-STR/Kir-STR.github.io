---
layout: home
---

Пошаговые инструкции по ИИ-инструментам — для тех, кто начинает с нуля.

## Инструкции

{% assign guides = site.pages | where_exp: "p", "p.guide == true" | sort: "date" | reverse -%}
{%- for g in guides %}
- [{{ g.title }}]({{ g.url | relative_url }}){% if g.description %} — {{ g.description }}{% endif %}
{%- endfor %}
