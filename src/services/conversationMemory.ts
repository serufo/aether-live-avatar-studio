import {
  ConversationUserProfile,
  ThoughtChainStep,
} from '../types/avatar';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizeWord(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function capitalizeName(raw: string): string {
  const connectors = new Set(['de', 'da', 'do', 'dos', 'das']);
  return raw
    .trim()
    .split(/\s+/)
    .map((part, idx) =>
      idx > 0 && connectors.has(part.toLowerCase())
        ? part.toLowerCase()
        : capitalizeWord(part)
    )
    .join(' ');
}

// Palavras comuns que seguem "eu sou ..." ou "sou ..." mas NÃO são nomes próprios
const NON_NAME_WORDS = new Set([
  'estudante', 'aluno', 'aluna', 'calouro', 'caloura', 'veterano', 'veterana',
  'graduando', 'graduanda', 'mestrando', 'mestranda', 'doutorando', 'doutoranda',
  'pos', 'professor', 'professora', 'docente', 'servidor', 'servidora', 'tecnico',
  'tecnica', 'pesquisador', 'pesquisadora', 'estagiario', 'estagiaria', 'bolsista',
  'cotista', 'indigena', 'quilombola', 'autista', 'surdo', 'surda', 'cego', 'cega',
  'pcd', 'trans', 'gay', 'lesbica', 'bissexual', 'nao', 'sim', 'muito', 'muita',
  'bem', 'mal', 'otimo', 'otima', 'triste', 'feliz', 'ansioso', 'ansiosa', 'cansado',
  'cansada', 'esgotado', 'esgotada', 'estressado', 'estressada', 'deprimido', 'deprimida',
  'sozinho', 'sozinha', 'perdido', 'perdida', 'preocupado', 'preocupada', 'nervoso',
  'nervosa', 'grato', 'grata', 'novo', 'nova', 'velho', 'velha', 'primeiro', 'primeira',
  'segundo', 'segunda', 'ultimo', 'ultima', 'um', 'uma', 'uns', 'umas', 'o', 'a', 'os',
  'as', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'para', 'pra', 'com', 'sem',
  'que', 'quem', 'qual', 'como', 'onde', 'quando', 'porque', 'por', 'aqui', 'la', 'ali',
  'hoje', 'ontem', 'amanha', 'agora', 'sempre', 'nunca', 'tudo', 'nada', 'algo', 'alguem',
  'ninguem', 'mesmo', 'mesma', 'proprio', 'propria', 'pessoa', 'gente', 'homem', 'mulher',
  'jovem', 'adulto', 'adulta', 'mae', 'pai', 'filho', 'filha', 'irmao', 'irma', 'amigo',
  'amiga', 'familiar', 'ufmg', 'engenharia', 'medicina', 'direito', 'letras', 'psicologia',
  'farmacia', 'fisica', 'quimica', 'matematica', 'computacao', 'historia', 'filosofia',
  'biologia', 'enfermagem', 'odontologia', 'arquitetura', 'economia', 'administracao',
  'pedagogia', 'veterinaria', 'fafich', 'icex', 'face', 'fale', 'fae', 'icb', 'ica',
  'coltec', 'pampulha', 'bh', 'belo', 'horizonte', 'montes', 'claros', 'brasil',
  'estou', 'tenho', 'preciso', 'quero', 'gostaria', 'posso', 'pode', 'ajuda', 'ajudar',
  'ola', 'oi', 'bom', 'boa', 'dia', 'tarde', 'noite', 'obrigado', 'obrigada', 'valeu',
  'desculpa', 'porfavor', 'favor', 'tchau', 'ate', 'logo', 'entendi', 'certo', 'claro',
]);

function isPlausibleName(candidate: string): boolean {
  const parts = candidate
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0 || parts.length > 3) return false;

  const firstNorm = normalize(parts[0]);
  if (firstNorm.length < 2 || firstNorm.length > 20) return false;
  if (NON_NAME_WORDS.has(firstNorm)) return false;
  if (/\d/.test(candidate)) return false;

  // Pelo menos a primeira palavra precisa ser um nome plausível (apenas letras)
  if (!/^[a-zà-ÿ]+$/i.test(parts[0])) return false;

  for (let i = 1; i < parts.length; i++) {
    const pNorm = normalize(parts[i]);
    if (pNorm === 'de' || pNorm === 'da' || pNorm === 'do') continue;
    if (pNorm.length < 2 || NON_NAME_WORDS.has(pNorm) || !/^[a-zà-ÿ]+$/i.test(parts[i])) {
      return false;
    }
  }
  return true;
}

export function extractUserNameFromTurn(
  userText: string,
  previousAvatarText?: string
): string | null {
  const trimmed = userText.trim();
  if (!trimmed) return null;

  // 1. Padrões explícitos de apresentação (PT-BR e EN)
  const explicitPatterns: RegExp[] = [
    /(?:meu nome [ée]|me chamo|pode me chamar de|me chama de|chame(?:-me)? de|my name is|call me)\s+([A-ZÀ-Ýa-zà-ÿ]{2,20}(?:\s+(?:de|da|do)?\s*[A-ZÀ-Ýa-zà-ÿ]{2,20})?)/i,
    /(?:^|[.!?,]\s*)(?:oi|ol[áa]|opa|bom dia|boa tarde|boa noite)?[\s,!]*?(?:eu\s+sou|sou|aqui\s+[ée])\s+(?:[oa]\s+)?([A-ZÀ-Ýa-zà-ÿ]{2,20}(?:\s+[A-ZÀ-Ýa-zà-ÿ]{2,20})?)(?=$|[.,!?;:\s]+(?:e\s+|estou|tenho|fa[çc]o|curso|estudo|trabalho|quero|preciso|gostaria|t[ôo]|to|vim|moro|sou))/i,
    /(?:^|[.!?,]\s*)(?:eu\s+sou|sou)\s+(?:[oa]\s+)?([A-ZÀ-Ýa-zà-ÿ]{2,20})(?=$|[.,!?]+$)/i,
  ];

  for (const rx of explicitPatterns) {
    const match = trimmed.match(rx);
    if (match && match[1]) {
      // Remove eventual verbo/palavra conectiva capturada como segunda palavra
      const words = match[1].trim().split(/\s+/);
      let candidate = words[0];
      if (words.length >= 2 && isPlausibleName(`${words[0]} ${words[1]}`)) {
        candidate = `${words[0]} ${words[1]}`;
      }
      if (isPlausibleName(candidate)) {
        return capitalizeName(candidate);
      }
    }
  }

  // 2. Resposta curta direta quando o avatar acabou de perguntar o nome
  const askedForName = Boolean(
    previousAvatarText &&
      /como posso te chamar|qual [ée] o seu nome|como voc[êe] se chama|me diz(?:er)? seu nome|seu nome\?/i.test(
        previousAvatarText
      )
  );

  if (askedForName) {
    const cleanedShort = trimmed
      .replace(/^(?:oi|ol[áa]|opa|bom dia|boa tarde|boa noite|tudo bem|prazer|muito prazer)[\s,!.]*/gi, '')
      .replace(/^(?:[ée]|eu sou|sou|me chamo|pode chamar de)\s+(?:[oa]\s+)?/i, '')
      .replace(/[.!?]+$/g, '')
      .trim();

    if (cleanedShort && !cleanedShort.includes('?') && cleanedShort.split(/\s+/).length <= 3) {
      if (isPlausibleName(cleanedShort)) {
        return capitalizeName(cleanedShort);
      }
    }
  }

  return null;
}

export function createEmptyUserProfile(initialGreetingText?: string): ConversationUserProfile {
  const askedInGreeting = Boolean(
    initialGreetingText &&
      /como posso te chamar|qual [ée] o seu nome|como voc[êe] se chama/i.test(initialGreetingText)
  );
  return {
    userName: null,
    academicStage: null,
    courseOrArea: null,
    campusOrUnit: null,
    emotionalSignals: [],
    discussedTopics: [],
    personalNotes: [],
    hasIntroducedAndAskedName: askedInGreeting,
    turnCount: 0,
    thoughtChain: [],
  };
}

function addUnique(list: string[], value: string, maxItems = 6): string[] {
  if (!value || list.includes(value)) return list;
  const next = [...list, value];
  return next.length > maxItems ? next.slice(next.length - maxItems) : next;
}

const CRISIS_REGEX =
  /\b(?:suicid\w*|me matar|tirar a propria vida|nao aguento mais viver|vontade de morrer|autoles\w*|me cortar|me machucar|acabar com tudo|desistir de viver)\b/;

export function updateConversationProfile(
  prev: ConversationUserProfile,
  userText: string,
  recentTurns: Array<{ speaker: 'user' | 'avatar' | 'system'; text: string }>
): {
  profile: ConversationUserProfile;
  latestThought: ThoughtChainStep;
  justLearnedName: boolean;
  isPureNameIntroduction: boolean;
} {
  const norm = normalize(userText);
  const lastAvatarTurn = [...recentTurns].reverse().find((t) => t.speaker === 'avatar');
  const extractedName = extractUserNameFromTurn(userText, lastAvatarTurn?.text);
  const justLearnedName = Boolean(extractedName && extractedName !== prev.userName);

  const userName = extractedName || prev.userName;
  let academicStage = prev.academicStage;
  let courseOrArea = prev.courseOrArea;
  let campusOrUnit = prev.campusOrUnit;
  let emotionalSignals = [...prev.emotionalSignals];
  let discussedTopics = [...prev.discussedTopics];
  let personalNotes = [...prev.personalNotes];

  // Detecta fase acadêmica / papel na comunidade
  if (/\b(?:doutorado|doutorand\w*)\b/.test(norm)) academicStage = 'Pós-Graduação (Doutorado)';
  else if (/\b(?:mestrado|mestrand\w*)\b/.test(norm)) academicStage = 'Pós-Graduação (Mestrado)';
  else if (/\b(?:pos-graduacao|pos graduacao|na pos|da pos)\b/.test(norm)) academicStage = 'Pós-Graduação';
  else if (/\b(?:calour[oa]s?|primeiro periodo|1o periodo|acabei de entrar)\b/.test(norm))
    academicStage = 'Graduação (Início de curso / Calouro)';
  else if (/\b(?:tcc|monografia|ultimo periodo|formand[oa]s?)\b/.test(norm))
    academicStage = 'Graduação (Fase final / TCC)';
  else if (/\b(?:graduacao|faculdade|universidade|periodo|semestre|materia|disciplina|provas?)\b/.test(norm) && !academicStage)
    academicStage = 'Estudante de Ensino Superior';
  else if (/\b(?:servidor\w*|docentes?|professor\w*|tecnico-administrativ\w*|tae)\b/.test(norm))
    academicStage = 'Servidor Universitário (Docente/TAE)';
  else if (/\b(?:meu filho|minha filha|meu irmao|minha irma|familiar|um amigo|uma amiga)\b/.test(norm) && !academicStage)
    academicStage = 'Familiar / Amigo buscando orientar apoio';

  // Detecta curso ou área
  if (/\b(?:medicina|fonoaudiologia|radiologia|enfermagem|odontologia|saude)\b/.test(norm))
    courseOrArea = 'Área da Saúde / Medicina';
  else if (/\b(?:engenharias?|exatas|matematica|fisica|quimica|computacao|estatistica|icex)\b/.test(norm))
    courseOrArea = 'Engenharias / Exatas';
  else if (/\b(?:direito)\b/.test(norm)) courseOrArea = 'Direito';
  else if (/\b(?:letras|fale)\b/.test(norm)) courseOrArea = 'Letras';
  else if (/\b(?:farmacia|fafar)\b/.test(norm)) courseOrArea = 'Farmácia';
  else if (/\b(?:humanas|sociais|psicologia|historia|filosofia|sociologia|fafich)\b/.test(norm))
    courseOrArea = 'Humanas e Ciências Sociais';
  else if (/\b(?:economia|administracao|contabeis|face)\b/.test(norm)) courseOrArea = 'FACE / Ciências Econômicas';
  else if (/\b(?:pedagogia|educacao|fae)\b/.test(norm)) courseOrArea = 'Educação (FAE)';
  else if (/\b(?:biologia|biomedicina|icb)\b/.test(norm)) courseOrArea = 'Ciências Biológicas (ICB)';
  else if (/\b(?:coltec)\b/.test(norm)) courseOrArea = 'Coltec';

  // Detecta campus ou unidade UFMG
  if (/\b(?:montes claros|ica)\b/.test(norm)) campusOrUnit = 'Campus Montes Claros (ICA)';
  else if (/\b(?:campus saude|medicina|direito|arquitetura|santa efigenia|dast centro)\b/.test(norm))
    campusOrUnit = 'Campus Saúde / Centro BH';
  else if (/\b(?:icex|espacamente)\b/.test(norm)) campusOrUnit = 'ICEx (Campus Pampulha)';
  else if (/\b(?:fafich|nad|spa)\b/.test(norm)) campusOrUnit = 'FAFICH (Campus Pampulha)';
  else if (/\b(?:engenharias?|naaeng)\b/.test(norm)) campusOrUnit = 'Engenharia (Campus Pampulha)';
  else if (/\b(?:letras|fale|sael)\b/.test(norm)) campusOrUnit = 'FALE / Letras (Campus Pampulha)';
  else if (/\b(?:face)\b/.test(norm)) campusOrUnit = 'FACE (Campus Pampulha)';
  else if (/\b(?:pampulha|ufmg)\b/.test(norm) && !campusOrUnit) campusOrUnit = 'UFMG (Campus Pampulha)';

  // Detecta sinais emocionais e vivências
  const isCrisis = CRISIS_REGEX.test(norm);
  if (isCrisis) emotionalSignals = addUnique(emotionalSignals, 'alerta de crise aguda / risco');
  if (/\b(?:ansios\w*|ansiedade|panico|aperto no peito|coracao acelerado|nervos\w*)\b/.test(norm))
    emotionalSignals = addUnique(emotionalSignals, 'ansiedade');
  if (/\b(?:esgotad\w*|burnout|cansad\w*|exaust\w*|sem energia|sobrecarreg\w*)\b/.test(norm))
    emotionalSignals = addUnique(emotionalSignals, 'esgotamento / burnout');
  if (/\b(?:triste\w*|depress\w*|deprimid\w*|vazio|desanim\w*|sem vontade|chorand\w*)\b/.test(norm))
    emotionalSignals = addUnique(emotionalSignals, 'tristeza / desânimo');
  if (/\b(?:sozinh\w*|solidao|isolad\w*|nao perten\w*|deslocad\w*|sem amigos)\b/.test(norm))
    emotionalSignals = addUnique(emotionalSignals, 'solidão / pertencimento');
  if (/\b(?:pressao|prazos?|provas?|reprov\w*|notas?|perfeccion\w*|bloqueio de escrita|cobranca)\b/.test(norm))
    emotionalSignals = addUnique(emotionalSignals, 'pressão acadêmica / prazos');
  if (/\b(?:orientador\w*|banca|laboratorio)\b/.test(norm))
    emotionalSignals = addUnique(emotionalSignals, 'relação com orientador');
  if (/\b(?:assedio|humilhacao|discriminacao|racismo|lgbtfobia|capacitismo)\b/.test(norm))
    emotionalSignals = addUnique(emotionalSignals, 'violência / discriminação');

  // Notas pessoais de interseccionalidade e contexto
  if (/\b(?:primeira geracao|primeir[oa] da minha familia)\b/.test(norm))
    personalNotes = addUnique(personalNotes, 'Estudante de primeira geração universitária');
  if (/\b(?:cotistas?|cotas)\b/.test(norm)) personalNotes = addUnique(personalNotes, 'Estudante cotista');
  if (/\b(?:trabalho e estudo|trabalhar e estudar|financeir\w*|bolsas?|fump|dinheiro|aluguel)\b/.test(norm))
    personalNotes = addUnique(personalNotes, 'Lida com pressão financeira / concilia trabalho e estudos');
  if (/\b(?:moro longe|outra cidade|interior|saudade de casa|moradia)\b/.test(norm))
    personalNotes = addUnique(personalNotes, 'Mora longe da família / deslocamento geográfico');
  if (/\b(?:deficiencia|pcd|autis\w*|tea|tdah|libras|nai|acessibilidade)\b/.test(norm))
    personalNotes = addUnique(personalNotes, 'Demanda de acessibilidade / neurodivergência / inclusão');
  if (/\b(?:lgbt\w*|trans|travesti|gay|lesbica|nao-binari\w*)\b/.test(norm))
    personalNotes = addUnique(personalNotes, 'Recorte LGBTQIA+');
  if (/\b(?:sigilo|confidencial\w*|coordenacao fica sabendo|segredo)\b/.test(norm))
    personalNotes = addUnique(personalNotes, 'Preocupação explícita com sigilo e confidencialidade');

  // Temas abordados
  if (/\b(?:dast|fump|spa|prae|cersam|caps|plantao|acolhimento|onde buscar ajuda)\b/.test(norm))
    discussedTopics = addUnique(discussedTopics, 'Rede de apoio e serviços UFMG/SUS');
  if (/\b(?:sigilo|etica|cfp)\b/.test(norm))
    discussedTopics = addUnique(discussedTopics, 'Sigilo e ética profissional');
  if (/\b(?:orientador\w*|mestrado|doutorado|tcc|pos)\b/.test(norm))
    discussedTopics = addUnique(discussedTopics, 'Desafios da pós-graduação / orientação');
  if (/\b(?:ansiedade|ansios\w*|estresse|burnout|provas?|prazos?)\b/.test(norm))
    discussedTopics = addUnique(discussedTopics, 'Manejo de ansiedade e esgotamento');
  if (/\b(?:nai|mudi|acessibilidade|inclusao|ccn|nuh|diversidade)\b/.test(norm))
    discussedTopics = addUnique(discussedTopics, 'Inclusão, diversidade e pertencimento');
  if (/\b(?:assedio|ouvidoria|denuncia)\b/.test(norm))
    discussedTopics = addUnique(discussedTopics, 'Enfrentamento ao assédio e Ouvidoria');
  if (/\b(?:familia|amig[oa]s?|crises?|como ajudar)\b/.test(norm))
    discussedTopics = addUnique(discussedTopics, 'Apoio de família e amigos em crises');

  // Verifica se o turno foi praticamente só a pessoa se apresentando com o nome
  const wordCount = trimmedWordsCount(userText);
  const isPureNameIntroduction =
    justLearnedName &&
    wordCount <= 8 &&
    !userText.includes('?') &&
    emotionalSignals.length === prev.emotionalSignals.length &&
    !isCrisis;

  const hasIntroducedAndAskedName =
    prev.hasIntroducedAndAskedName ||
    Boolean(
      lastAvatarTurn &&
        /como posso te chamar|qual [ée] o seu nome|como voc[êe] se chama/i.test(lastAvatarTurn.text)
    );

  // Constrói passo estruturado da Cadeia de Pensamentos deste turno
  const turnIndex = prev.turnCount + 1;
  const userIntent = isCrisis
    ? 'Sinal de sofrimento agudo / risco — prioridade absoluta de segurança e acolhimento imediato'
    : isPureNameIntroduction
    ? `Apresentação pessoal: informou se chamar ${userName}`
    : emotionalSignals.length > prev.emotionalSignals.length
    ? `Compartilhou vivência emocional (${emotionalSignals[emotionalSignals.length - 1]})`
    : /\?/.test(userText)
    ? `Busca de orientação prática / dúvida direcionada`
    : `Continuidade do diálogo e elaboração pessoal`;

  const profileBits = [
    userName ? `Nome: ${userName}` : 'Nome ainda não informado',
    academicStage,
    courseOrArea,
    campusOrUnit,
    emotionalSignals.length > 0 ? `Sinais: ${emotionalSignals.slice(-2).join(', ')}` : null,
  ].filter(Boolean);

  const profileInsight = profileBits.join(' • ');

  const prevThought = prev.thoughtChain[prev.thoughtChain.length - 1];
  const continuityLink = prevThought
    ? `Conectar com o turno anterior (${prevThought.userIntent}) evitando repetir orientações já dadas`
    : 'Início de vínculo: construir segurança emocional e proximidade desde o primeiro contato';

  let responseStrategy = '';
  if (isCrisis) {
    responseStrategy = `${
      userName ? `Chamar ${userName} pelo nome com calma, ` : ''
    }validar a dor sem julgamento, verificar segurança imediata e informar CVV 188, CERSAM/CAPS, UPA, SAMU 192 e DAST UFMG`;
  } else if (isPureNameIntroduction && userName) {
    responseStrategy = `Dar boas-vindas calorosas chamando ${userName} pelo nome, reafirmar espaço seguro e convidar a contar o que trouxe até aqui hoje`;
  } else if (!userName && !hasIntroducedAndAskedName) {
    responseStrategy = `Apresentar-se brevemente, responder à questão inicial com empatia e perguntar o nome da pessoa para personalizar a conversa`;
  } else if (!userName) {
    responseStrategy = `Responder de forma acolhedora e objetiva e, se couber com naturalidade, convidar a pessoa a dizer como prefere ser chamada`;
  } else {
    const personalizationHint = [courseOrArea, campusOrUnit, academicStage].filter(Boolean).join(', ');
    responseStrategy = `Chamar ${userName} pelo nome naturalmente, conectar ao histórico recente${
      personalizationHint ? ` e personalizar para o contexto de ${personalizationHint}` : ''
    }, oferecendo um próximo passo acolhedor`;
  }

  const latestThought: ThoughtChainStep = {
    turnIndex,
    timestamp: new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    userIntent,
    profileInsight,
    continuityLink,
    responseStrategy,
  };

  const nextThoughtChain = [...prev.thoughtChain, latestThought].slice(-8);

  const profile: ConversationUserProfile = {
    userName,
    academicStage,
    courseOrArea,
    campusOrUnit,
    emotionalSignals,
    discussedTopics,
    personalNotes,
    hasIntroducedAndAskedName: hasIntroducedAndAskedName || (!userName && !isCrisis),
    turnCount: turnIndex,
    thoughtChain: nextThoughtChain,
  };

  return { profile, latestThought, justLearnedName, isPureNameIntroduction };
}

function trimmedWordsCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Formata o perfil vivo + cadeia de pensamentos + resumo da janela de contexto para o System Instruction do modelo
export function formatConversationContextForPrompt(
  profile: ConversationUserProfile | undefined,
  recentTurns: Array<{ speaker: 'user' | 'avatar' | 'system'; text: string }> = [],
  avatarName = 'Avatar'
): string {
  const blocks: string[] = [];

  if (profile) {
    const lines: string[] = [
      `=== PERFIL VIVO DA PESSOA NESTA CONVERSA (USE PARA PERSONALIZAR) ===`,
      `- Nome da pessoa: ${
        profile.userName
          ? `${profile.userName} (REGISTRADO — chame-a pelo nome "${profile.userName}" sempre que soar natural!)`
          : 'Ainda não informado (se ainda não perguntou e não for crise aguda, apresente-se brevemente e pergunte como ela gostaria de ser chamada antes de aprofundar o tema).'
      }`,
    ];
    if (profile.academicStage) lines.push(`- Fase / Papel: ${profile.academicStage}`);
    if (profile.courseOrArea) lines.push(`- Curso / Área: ${profile.courseOrArea}`);
    if (profile.campusOrUnit) lines.push(`- Campus / Unidade: ${profile.campusOrUnit}`);
    if (profile.emotionalSignals.length > 0) {
      lines.push(`- Sinais emocionais / vivências relatadas: ${profile.emotionalSignals.join(', ')}`);
    }
    if (profile.personalNotes.length > 0) {
      lines.push(`- Notas relevantes do perfil: ${profile.personalNotes.join('; ')}`);
    }
    if (profile.discussedTopics.length > 0) {
      lines.push(`- Temas já abordados nesta sessão: ${profile.discussedTopics.join(', ')}`);
    }
    blocks.push(lines.join('\n'));

    if (profile.thoughtChain.length > 0) {
      const recentSteps = profile.thoughtChain.slice(-4);
      const chainLines = [
        `=== CADEIA DE PENSAMENTOS DA SESSÃO (RACIOCÍNIO INTERNO CONTÍNUO — NUNCA LEIA EM VOZ ALTA) ===`,
        ...recentSteps.map(
          (step) =>
            `[Turno ${step.turnIndex}] Intenção: ${step.userIntent} | Perfil: ${step.profileInsight} | Continuidade: ${step.continuityLink} | Estratégia: ${step.responseStrategy}`
        ),
      ];
      blocks.push(chainLines.join('\n'));
    }
  }

  const validTurns = recentTurns
    .filter((t) => (t.speaker === 'user' || t.speaker === 'avatar') && t.text.trim().length > 0)
    .slice(-14);

  if (validTurns.length > 0) {
    const userLabel = profile?.userName || 'Usuário';
    const historyLines = [
      `=== JANELA DE CONTEXTO — HISTÓRICO DESTA CONVERSA ATÉ ESTE MOMENTO (${validTurns.length} turnos) ===`,
      ...validTurns.map(
        (t) => `${t.speaker === 'user' ? userLabel : avatarName}: ${t.text.slice(0, 260)}`
      ),
    ];
    blocks.push(historyLines.join('\n'));
  }

  return blocks.length > 0 ? `\n\n${blocks.join('\n\n')}` : '';
}
