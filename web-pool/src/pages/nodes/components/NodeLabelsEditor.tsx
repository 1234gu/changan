import { useMemo, useRef, useState } from 'react';
import {
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { Button, Input, Popover, Space, Tag, Typography } from 'antd';

interface LabelEntry {
  id: number;
  key: string;
  value: string;
}

interface NodeLabelsEditorProps {
  labels: string[];
  editable: boolean;
  loading?: boolean;
  onSave: (labels: string[]) => Promise<boolean>;
}

const LABEL_PART_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function splitLabel(label: string, id: number): LabelEntry {
  const separator = label.indexOf(':');
  if (separator < 0) return { id, key: label, value: '' };
  return {
    id,
    key: label.slice(0, separator),
    value: label.slice(separator + 1),
  };
}

export function NodeLabelsEditor({ labels, editable, loading, onSave }: NodeLabelsEditorProps) {
  const nextId = useRef(1);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<LabelEntry[]>([]);

  const resetDraft = () => {
    setDraft(labels.map((label) => splitLabel(label, nextId.current++)));
  };

  const validationError = useMemo(() => {
    const completed = draft.filter(({ key, value }) => key.trim() || value.trim());
    if (completed.some(({ key, value }) => !key.trim() || !value.trim())) {
      return '标签的 Key 和 Value 需要同时填写。';
    }
    if (
      completed.some(
        ({ key, value }) =>
          !LABEL_PART_PATTERN.test(key.trim()) || !LABEL_PART_PATTERN.test(value.trim()),
      )
    ) {
      return 'Key 和 Value 需以字母或数字开头，仅支持字母、数字、下划线、点和短横线。';
    }
    const keys = completed.map(({ key }) => key.trim().toLowerCase());
    if (new Set(keys).size !== keys.length) return '同一个 Key 只能设置一个 Value。';
    return null;
  }, [draft]);

  const updateEntry = (id: number, field: 'key' | 'value', value: string) => {
    setDraft((entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) return;
    if (nextOpen) resetDraft();
    setOpen(nextOpen);
  };

  const handleSave = async () => {
    if (validationError) return;
    const nextLabels = draft
      .filter(({ key, value }) => key.trim() && value.trim())
      .map(({ key, value }) => `${key.trim()}:${value.trim()}`);

    setSubmitting(true);
    try {
      if (await onSave(nextLabels)) setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const labelPreview = (
    <span className="node-labels-preview">
      {labels.length > 0 ? (
        <>
          {labels.slice(0, 3).map((label) => (
            <Tag key={label} bordered={false}>
              {label}
            </Tag>
          ))}
          {labels.length > 3 && (
            <span className="node-labels-preview__more">+{labels.length - 3}</span>
          )}
        </>
      ) : (
        <span className="node-labels-preview__empty">+ 设置标签</span>
      )}
      {editable && <EditOutlined className="node-labels-preview__edit" aria-hidden="true" />}
    </span>
  );

  if (!editable) return labelPreview;

  return (
    <Popover
      open={open}
      trigger="click"
      placement="bottomLeft"
      onOpenChange={handleOpenChange}
      title="编辑节点标签"
      content={
        <div className="node-label-editor" aria-label="编辑节点标签">
          <div className="node-label-editor__headings" aria-hidden="true">
            <span>Key</span>
            <span>Value</span>
          </div>
          <div className="node-label-editor__rows">
            {draft.map((entry) => (
              <div className="node-label-editor__row" key={entry.id}>
                <Input
                  size="small"
                  value={entry.key}
                  placeholder="例如 site"
                  aria-label="标签 Key"
                  maxLength={63}
                  onChange={(event) => updateEntry(entry.id, 'key', event.target.value)}
                />
                <Input
                  size="small"
                  value={entry.value}
                  placeholder="例如 lab"
                  aria-label="标签 Value"
                  maxLength={127}
                  onChange={(event) => updateEntry(entry.id, 'value', event.target.value)}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  aria-label="删除标签"
                  icon={<DeleteOutlined />}
                  onClick={() => setDraft((entries) => entries.filter(({ id }) => id !== entry.id))}
                />
              </div>
            ))}
          </div>
          <Button
            type="dashed"
            size="small"
            block
            icon={<PlusOutlined />}
            disabled={draft.length >= 32}
            onClick={() =>
              setDraft((entries) => [...entries, { id: nextId.current++, key: '', value: '' }])
            }
          >
            添加标签
          </Button>
          {validationError && (
            <Typography.Text className="node-label-editor__error" type="danger">
              {validationError}
            </Typography.Text>
          )}
          <Space className="node-label-editor__actions" size={8}>
            <Button
              size="small"
              icon={<CloseOutlined />}
              disabled={submitting || loading}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              loading={submitting || loading}
              disabled={Boolean(validationError)}
              onClick={() => void handleSave()}
            >
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <Button type="text" size="small" className="node-labels-trigger" aria-label="设置节点标签">
        {labelPreview}
      </Button>
    </Popover>
  );
}
