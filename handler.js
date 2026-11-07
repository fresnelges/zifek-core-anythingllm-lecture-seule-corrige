// Zifek Core — AnythingLLM Custom Agent Skill, consultation uniquement.
// Manifest validé contre les exigences AnythingLLM (schema/entrypoint/imported).
// Autorisations locales explicites: aucune écriture ne peut partir de ce skill.
// Le jeton est lié au compte de test, ne pas utiliser ce skill avec droits d’écriture.
const ALLOWED_TOOLS = new Set(require('./allowlist.json'));
const GATEWAY = 'https://vpe2e6ibvgugvmg4gt26.helloreaddy.com/functions/v1/core-ai-gateway';
const FORBIDDEN_PARAM_KEYS = new Set(['user_id','userid','organization_id','org_id',
  'owner_id','agent_token','zifek_agent_token','authorization','x-zifek-agent-token']);

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}
function hasIdentityOrSecret(obj, depth = 0) {
  if (depth > 6) return true;
  if (Array.isArray(obj)) return obj.some(v => hasIdentityOrSecret(v,depth+1));
  if (!asObject(obj)) return false;
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_PARAM_KEYS.has(k.toLowerCase())) return true;
    if (hasIdentityOrSecret(v,depth+1)) return true;
  }
  return false;
}
function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 1600) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.href.replace(/\(/g,'%28').replace(/\)/g,'%29');
  } catch { return null; }
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[\\\[\]*`_<>]/g, ' ')
    .replace(/[\r\n]/g, ' ').slice(0, 180);
}
function lineImage(alt, url) {
  const href = safeUrl(url);
  return href ? '![' + esc(alt) + '](' + href + ')' : '';
}
function lineLink(label, url) {
  const href = safeUrl(url);
  return href ? '[' + esc(label) + '](' + href + ')' : '';
}
function itemsFrom(data) {
  if (Array.isArray(data)) return data;
  if (!asObject(data)) return [];
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) return v;
  }
  return [data];
}
function usablePrice(item) {
  if (item.price_available === false || item.price_reason === 'price_not_configured') return 'Tarif non renseigné';
  const val = item.estimated_total ?? item.price_per_night ?? item.price ?? item.amount ?? item.unit_price;
  if (val === undefined || val === null) return '';
  if (Number(val) === 0 && item.price_available !== true && item.is_free !== true) return 'Tarif non renseigné';
  return 'Prix renseigné : ' + String(val) + ' ' + (item.currency || 'MAD');
}
function availabilityStatus(item) {
  const av = asObject(item.availability);
  if (av) {
    if (av.available === true && av.reliable === true) return 'Disponibilité vérifiée à la date du contrôle';
    if (av.available === false) return 'Non disponible selon Zifek Core';
    return 'Disponibilité non confirmée';
  }
  if (item.availability_checked === false) return 'Disponibilité non vérifiée';
  if (item.available === true && item.reliable === true) return 'Disponibilité vérifiée à la date du contrôle';
  return '';
}
function renderItem(item) {
  if (!asObject(item)) return '- ' + esc(String(item));
  const out=[];
  const name=item.accommodation_name || item.name || item.title || item.label || 'Ressource Zifek';
  const cover= item.cover_image || item.image_url || item.product_image || item.image || (asObject(item.media?.cover) || {}).url;
  const coverLine=lineImage(name,cover);
  if (coverLine) out.push(coverLine);
  out.push('**' + esc(name) + '**');
  const id = item.resource_id ?? item.accommodation_id ?? item.id;
  if (id !== undefined && id !== null) out.push('ID : ' + esc(id));
  if (item.city || item.category) out.push([item.city,item.category].filter(Boolean).map(esc).join(' · '));
  const p=usablePrice(item); if(p) out.push(p);
  const status=availabilityStatus(item); if(status)out.push(status);
  if (item.quotable === false)out.push('Devis bloqué ; ' + esc((item.blockers||[]).join(', ')||'non payable'));
  if (item.preview_ready === false)out.push('Aucune pré-réservation créée');
  const media=asObject(item.media);
  if(media) {
    const imgs=Array.isArray(media.images) ? media.images : [];
    const vids=Array.isArray(media.videos) ? media.videos : [];
    const nimg=media.image_count ?? item.image_count;
    const nvid=media.video_count ?? item.video_count;
    if(nimg!==undefined)out.push('Photos : ' + esc(nimg));
    if(nvid!==undefined)out.push('Vidéos : ' + esc(nvid));
    for(const img of imgs) {
      const s=lineImage(img.alt||name, img.url); if(s)out.push(s);
    }
    for(const video of vids) {
      const thumb=lineImage(video.title || 'Vidéo',video.thumbnail_url); if(thumb)out.push(thumb);
      const s=lineLink(video.title || 'Voir la vidéo',video.url); if(s)out.push(s);
    }
  } else {
    if(item.image_count!==undefined)out.push('Photos : ' + esc(item.image_count));
    if(item.video_count!==undefined)out.push('Vidéos : ' + esc(item.video_count));
  }
  const gallery=asObject(item.gallery);
  if (gallery?.has_more || item.has_more) out.push('Galerie paginée : demander la suite avec offset=' + esc(gallery?.next_offset ?? item.next_offset));
  if(item.expires_at)out.push('Lien temporaire expirant le ' + esc(item.expires_at));
  const fiche=lineLink('Voir la fiche Zifek',item.zifek_url || item.detail_url);
  if(fiche) out.push(fiche);
  return out.join('\n');
}
function render(payload, tool) {
  const rejected = payload.ok === false || payload.success === false;
  if(rejected) {
    return 'Zifek Core a refusé l’opération : ' + esc(payload.error || payload.message || payload.reason || 'Erreur métier') +
      '. Aucune action réussie ne doit être annoncée.';
  }
  const data = itemsFrom(payload.data);
  const lines = [
    'Résultat réel de Zifek Core pour « '+esc(tool)+' ». Ne pas inventer de médias, prix, créneaux ni statuts.',
    ...data.slice(0, 12).map(renderItem)
  ];
  if(data.length>12)lines.push('Résultats partiels : demander une page plus petite ou la pagination pour la suite.');
  if(payload.meta)lines.push('Métadonnées : '+JSON.stringify(payload.meta).slice(0,2200));
  // Conserver le contrat de vérité lisible par le modèle, sans jamais le réinterpréter comme un succès d’écriture.
  if(data.some(x => x && x.preview_ready === false)) lines.push('VÉRITÉ : preview_ready=false => AUCUNE PRÉ-RÉSERVATION.');
  if(data.some(x => x && x.quotable === false)) lines.push('VÉRITÉ : quotable=false => AUCUN DEVIS FINALISÉ.');
  let answer=lines.join('\n\n');
  if(answer.length>18000)answer=answer.slice(0,17500)+'\n\nRéponse limitée pour protéger le contexte ; utiliser limit/offset.';
  return answer;
}

module.exports.runtime = {
  handler: async function ({tool, params_json} = {}) {
    try {
      if(typeof tool!=='string' || !ALLOWED_TOOLS.has(tool))
        return 'Outil refusé : consultation uniquement. Aucun achat, panier, réservation, paiement, modification ni média privé n’est autorisé.';
      let params={};
      if(params_json && typeof params_json==='string') {
        if(params_json.length > 8000) return 'Paramètres trop longs.';
        try { params=JSON.parse(params_json); } catch { return 'params_json doit contenir un objet JSON valide.'; }
      } else if (asObject(params_json)) params=params_json;
      if(!asObject(params))return 'params_json doit être un objet JSON.';
      if(hasIdentityOrSecret(params))return 'Paramètres refusés : identité ou secret transmis par le modèle. Zifek résout l’identité depuis le jeton.';
      if(JSON.stringify(params).length > 8000)return 'Paramètres trop longs.';
      if((tool.includes('media') || tool.includes('images') || tool.includes('videos')) && params.limit) {
        const limit=Number(params.limit);
        if(!Number.isInteger(limit) || limit<1)return 'limit invalide.';
        params.limit=Math.min(limit,12);
      }
      const token=String(process.env.ZIFEK_AGENT_TOKEN || this?.runtimeArgs?.ZIFEK_AGENT_TOKEN || '').trim();
      if(!token)return 'Configuration manquante : ZIFEK_AGENT_TOKEN. Renseigner un jeton de lecture privé dans les réglages de la compétence.';
      const abort=new AbortController();
      const timer=setTimeout(()=>abort.abort(),20000);
      let res;
      try {
        res=await fetch(GATEWAY+'?tool='+encodeURIComponent(tool), {
          method:'POST',redirect:'error',signal:abort.signal,
          headers:{'Content-Type':'application/json','Accept':'application/json','x-zifek-agent-token':token},
          body:JSON.stringify({tool,params})
        });
      } finally { clearTimeout(timer); }
      if(!res.ok) {
        return 'Passerelle Zifek Core : HTTP '+res.status+'. '+
          (res.status===401?'Jeton manquant, invalide ou expiré.':
           res.status===403?'Permissions insuffisantes ou ressource refusée.':
           res.status===404?'Outil ou ressource introuvable.':'Consulter les journaux serveur.')+
          ' Aucune action exécutée.';
      }
      let payload;
      try { payload=await res.json(); }
      catch { return 'Erreur Zifek Core : réponse non JSON. Ne pas inventer les données.'; }
      if(!asObject(payload))return 'Réponse Zifek Core non valide.';
      return render(payload,tool);
    } catch (err) {
      return 'Échec technique de la consultation Zifek Core ('+
        (err?.name==='AbortError'?'délai dépassé':'erreur réseau ou de traitement')+
        '). Aucune donnée ni réservation ne doit être inventée.';
    }
  }
};
