import { useMemo, useState } from "react";
import { externalLinkProps } from "./desktop";
import {
  PROVIDERS,
  activeProvider as resolveActiveProvider,
  fetchRemoteModels,
  loadAiSettings,
  providerById,
  providerConfig,
  saveAiSettings,
  testConnection,
  type AiSettings,
  type ProviderConfig,
  type ProviderId,
  type ProviderPreset,
} from "./providers";
import { AiDebugPanel } from "./AiDebugPanel";

type Feedback = { ok: boolean; text: string };

/**
 * 简化版 AI 设置：单一服务商选择器。
 *
 * 需求：老师只需要「选服务商 → 填 API Key」两步。
 * - 选定服务商后自动带出预设 URL（只读展示，不可乱填）。
 * - 模型用下拉选择，也可切换为「自定义」手动填 ID。
 * - 服务商预设里默认取第一个模型，因此不填模型也能直接用。
 */
export function AiSettingsPane() {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [selectedId, setSelectedId] = useState<ProviderId>(() => {
    const current = loadAiSettings();
    return (current.activeProvider ||
      PROVIDERS[0].id) as ProviderId;
  });
  const [busy, setBusy] = useState<"test" | "models" | undefined>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [reveal, setReveal] = useState(false);
  // 模型是否为「自定义手填」状态
  const [customModel, setCustomModel] = useState(false);

  const preset = providerById(selectedId);
  const config = providerConfig(settings, selectedId);

  function update(next: AiSettings) {
    setSettings(next);
    saveAiSettings(next);
  }

  function patch(patchValue: Partial<ProviderConfig>) {
    const current = providerConfig(settings, selectedId);
    update({
      ...settings,
      providers: {
        ...settings.providers,
        [selectedId]: { ...current, ...patchValue },
      },
    });
  }

  // 模型下拉选项：预设 + 已拉取的远端模型（去重）
  const modelOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...preset.models.map((item) => item.id), ...remoteModels]
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((id) => ({
        id,
        label: preset.models.find((item) => item.id === id)?.label ?? id,
      }));
  }, [preset, remoteModels]);

  function selectProvider(id: ProviderId) {
    setSelectedId(id);
    setFeedback(undefined);
    setRemoteModels([]);
    setCustomModel(false);
    // 切换服务商时，若尚未显式激活过，立即设为当前生效（Key 填了即生效）
    update({ ...settings, activeProvider: id });
  }

  function onModelSelect(value: string) {
    if (value === "__custom__") {
      setCustomModel(true);
      return;
    }
    setCustomModel(false);
    patch({ model: value });
  }

  async function runTest() {
    const cfg = providerConfig(settings, selectedId);
    setBusy("test");
    setFeedback(undefined);
    try {
      const text = await testConnection(preset, cfg);
      setFeedback({ ok: true, text });
    } catch (cause) {
      setFeedback({ ok: false, text: (cause as Error).message });
    } finally {
      setBusy(undefined);
    }
  }

  async function runFetchModels() {
    const cfg = providerConfig(settings, selectedId);
    setBusy("models");
    setFeedback(undefined);
    try {
      const ids = await fetchRemoteModels(preset, cfg);
      setRemoteModels(ids);
      setFeedback({
        ok: true,
        text: `已拉取 ${ids.length} 个模型，可在下拉中选择。`,
      });
    } catch (cause) {
      setFeedback({ ok: false, text: (cause as Error).message });
    } finally {
      setBusy(undefined);
    }
  }

  const ready = config.apiKey.trim().length > 0;
  const isCurrentModelInOptions = modelOptions.some(
    (option) => option.id === config.model,
  );

  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>Local First · AI Optional</span>
          <h1>AI 设置</h1>
          <p>本地优先，AI 按需使用。选好服务商、填上 API Key 即可。</p>
        </div>
      </div>

      <section className="panel ai-settings-note">
        <ul>
          <li>
            完整学生档案默认保存在本机浏览器；<strong>AI 是可选能力</strong>
            ，未配置时核心工作台照常使用（复制 Prompt → 手动粘贴返回）。
          </li>
          <li>
            API Key 只保存在本机，<strong>不写入学生数据</strong>
            ，不会随「本地备份」导出。
          </li>
          <li>
            只有教师主动使用 AI 功能时才可能产生外部请求；外发内容必须先经过
            Privacy Gateway：最小必要、去标识化、排除无关敏感字段、人工确认。
          </li>
          <li>
            AI 返回的内容在本机恢复必要身份，<strong>经人工审核后</strong>
            才会保存到本地记录。
          </li>
        </ul>
      </section>

      <section className="panel ai-config">
        <div className="ai-config-head">
          <div>
            <span className="eyebrow">服务商</span>
            <h2>{preset.name}</h2>
          </div>
          {ready && (
            <span className="ai-config-active">当前生效</span>
          )}
        </div>

        <label className="ai-field">
          <span>服务商</span>
          <select
            aria-label="服务商"
            value={selectedId}
            onChange={(event) =>
              selectProvider(event.target.value as ProviderId)
            }
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.id === "agnes" ? "（免费）" : ""} · {item.vendor}
              </option>
            ))}
          </select>
        </label>

        <div className="ai-field ai-field-readonly">
          <span>接口地址（预设，无需修改）</span>
          <code>{preset.baseUrl}</code>
        </div>

        <label className="ai-field">
          <span>API Key</span>
          <span className="ai-key-row">
            <input
              type={reveal ? "text" : "password"}
              value={config.apiKey}
              autoComplete="off"
              spellCheck={false}
              placeholder="粘贴 Key，仅保存在本机"
              onChange={(event) => patch({ apiKey: event.target.value })}
            />
            <button onClick={() => setReveal((value) => !value)}>
              {reveal ? "隐藏" : "显示"}
            </button>
          </span>
        </label>

        <label className="ai-field">
          <span>模型</span>
          {customModel || !isCurrentModelInOptions ? (
            <span className="ai-key-row">
              <input
                value={config.model}
                spellCheck={false}
                placeholder="直接填写模型 ID"
                onChange={(event) => patch({ model: event.target.value })}
              />
              {modelOptions.length > 0 && (
                <button onClick={() => setCustomModel(false)}>
                  从列表选
                </button>
              )}
            </span>
          ) : (
            <select
              aria-label="模型"
              value={config.model}
              onChange={(event) => onModelSelect(event.target.value)}
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              <option value="__custom__">自定义模型…</option>
            </select>
          )}
        </label>

        <div className="ai-config-actions">
          <button
            className="primary"
            onClick={() => void runTest()}
            disabled={!!busy || !ready}
          >
            {busy === "test" ? "测试中…" : "测试连接"}
          </button>
          {preset.supportsModelList && (
            <button
              onClick={() => void runFetchModels()}
              disabled={!!busy || !ready}
            >
              {busy === "models" ? "拉取中…" : "拉取模型列表"}
            </button>
          )}
          <a {...externalLinkProps(preset.applyUrl)}>获取 Key →</a>
        </div>

        {feedback && (
          <p className={feedback.ok ? "ai-feedback ok" : "ai-feedback bad"}>
            {feedback.text}
          </p>
        )}
        {preset.caution && <p className="ai-caution">{preset.caution}</p>}
      </section>
      {/* 仅开发模式 / 演示模式渲染；正式用户看不到，面板内不显示 API Key。 */}
      <AiDebugPanel />
    </>
  );
}
