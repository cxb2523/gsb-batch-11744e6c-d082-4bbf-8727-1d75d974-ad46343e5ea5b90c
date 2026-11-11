<script lang="ts">
  import AboutText from '#lib/components/AboutText.svelte';
  import Head from '#lib/components/Head.svelte';
  import IndexPage from '#lib/components/IndexPage.svelte';
  import { t } from '#lib/i18n/i18n.svelte.js';
  import { name } from '#lib/meta.js';
</script>

<Head
  title="About {name}"
  description="Who makes {name}, where its live TfL data comes from, how it treats your privacy, and where to find its open source code."
  path="/about"
/>

<IndexPage heading={t.about}>
  <AboutText page />
</IndexPage>
