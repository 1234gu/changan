import React from 'react';
import {stateName} from './mappingDetailData';

export const stamp = ts => Number.isFinite(ts) ? new Date(ts * 1000).toLocaleString('zh-CN',{hour12:false}) : '—';
export const number = (n,d=1) => Number.isFinite(n) ? n.toLocaleString('zh-CN',{maximumFractionDigits:d}) : '—';
export const size = (n,d=2) => Number.isFinite(n) ? `${number(n/1048576,d)} MiB` : '—';
export const seconds = n => Number.isFinite(n) ? `${number(n,2)} s` : '—';
export const amount = (n,unit,d=1) => Number.isFinite(n) ? `${number(n,d)} ${unit}` : '—';
export const list = xs => Array.isArray(xs) && xs.length ? xs.join('、') : '—';
export function Badge({status}) {return <span className={`badge ${status?.toLowerCase() || ''}`}><i/>{stateName(status)}</span>}
export function Fields({items}) {return <dl className="md-fields">{items.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value ?? '—'}</dd></div>)}</dl>}
export function Panel({title,description,children,action}) {return <section className="panel md-panel"><div className="md-panel-heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}</div>{children}</section>}
export function Note({children}) {return <p className="note md-note">{children}</p>}
export function Table({headers,children}) {return <div className="table-scroll md-table" tabIndex={0} role="region" aria-label={`${headers[0]}明细`}><table><thead><tr>{headers.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
