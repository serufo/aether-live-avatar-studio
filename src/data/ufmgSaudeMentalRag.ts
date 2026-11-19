import { KnowledgeDocument } from '../types/avatar';

function makeUfmgDoc(
  id: string,
  title: string,
  fileName: string,
  injectionMode: 'rag_vector' | 'direct_context',
  content: string
): KnowledgeDocument {
  return {
    id,
    avatarId: 'avatar-samia-photo',
    title,
    fileName,
    fileType: 'md',
    injectionMode,
    createdAt: '2026-11-19T12:00:00Z',
    sizeBytes: content.length,
    content,
    chunks: [],
  };
}

export const UFMG_SAUDE_MENTAL_DOCUMENTS: KnowledgeDocument[] = [
  makeUfmgDoc(
    'doc-samia-ufmg-1',
    'Portal Saúde Mental UFMG — Apresentação, Conceito de Saúde Mental, Mitos e Fatos (15 itens), Depoimentos e Arte',
    'ufmg_saudemental_conceitos_mitos_fatos.md',
    'rag_vector',
    `# Portal Saúde Mental UFMG (ufmg.br/saudemental) — Apresentação e Conceito

## Apresentação Institucional do Portal Saúde Mental UFMG
O Portal Saúde Mental UFMG (www.ufmg.br/saudemental) consolida a Política de Saúde Mental da Universidade Federal de Minas Gerais como uma construção coletiva baseada na responsabilidade compartilhada pelo cuidado na comunidade acadêmica. A apresentação institucional destaca a gestão da Reitoria (Prof. Alessandro Fernandes Moreira, Reitor, e Profa. Alamanda Kfoury Pereira, Vice-Reitora), a cartilha Trilhas do Cuidado: Escuta e acolhimento na UFMG, a participação da Rádio UFMG Educativa com o programa especial Louca Sintonia e os espaços de escuta para estudantes, servidores, familiares e amigos.

## O que é Saúde Mental? (OMS, Naomar de Almeida Filho e Arthur Bispo do Rosário)
A saúde mental é um conceito amplo e coletivo que não se reduz à ausência de transtornos mentais. Para a Organização Mundial da Saúde (OMS), saúde mental é um estado de bem-estar no qual o indivíduo percebe suas próprias habilidades, consegue lidar com os estresses normais da vida, trabalha de forma produtiva e contribui para sua comunidade.
Naomar de Almeida Filho, Maria Thereza Ávila Coelho e Maria Fernanda Peres (Revista USP nº 43, 1999) ampliam o conceito afirmando que saúde mental significa um socius saudável e implica emprego, satisfação no trabalho, vida cotidiana significativa, participação social, lazer, qualidade das redes sociais, equidade e qualidade de vida — constituindo uma pauta emancipatória e política. O portal também evoca o artista Arthur Bispo do Rosário: "Os loucos são como beija-flores: nunca pousam… Ficam a dois metros do chão."

## Mitos e Fatos sobre Saúde Mental (Itens 1 a 4)
1. Ir ao psiquiatra ou psicólogo não é só para casos gravíssimos: buscar cuidado psicológico ou psiquiátrico é válido diante de qualquer sofrimento, angústia ou necessidade de prevenção e autoconhecimento.
2. Depressão não é preguiça nem falta de força de vontade: é uma condição séria de sofrimento psíquico com múltiplos fatores biológicos, psicológicos e sociais que exige acolhimento e cuidado adequado.
3. Doença mental não é sinônimo de periculosidade: como apontava Franco Basaglia, a periculosidade atribuída às pessoas em sofrimento mental reside na falta de respostas sociais e institucionais às suas necessidades, e não no transtorno em si.
4. O mito da felicidade permanente: como analisa Zygmunt Bauman, a sociedade contemporânea impõe a felicidade constante como obrigação e mercadoria, gerando culpa diante da tristeza e da vulnerabilidade, que são partes naturais da vida humana.

## Mitos e Fatos sobre Saúde Mental (Itens 5 a 7)
5. Falar sobre o sofrimento ajuda: conversar sobre o que se sente com pessoas de confiança reduz o estresse, alivia o peso emocional e contribui para melhorar a autoestima.
6. Como apoiar alguém em sofrimento: acolher, ouvir sem julgamento e incentivar a busca por ajuda profissional respeitando sempre a autonomia da pessoa.
7. Depressão não significa tomar remédio para o resto da vida: o cuidado em saúde mental envolve abordagens multiprofissionais, psicoterapia, mudanças de contexto, redes de apoio e, quando indicado por avaliação médica, medicação acompanhada pelo tempo necessário.

## Mitos e Fatos sobre Suicídio (Itens 8 a 11)
8. Calma súbita após crise ou ideação suicida não garante ausência de risco: segundo o Conselho Federal de Psicologia (CFP, 2013), uma melhora ou tranquilidade repentina pode indicar que a pessoa tomou uma decisão; por isso, manter conversa aberta e acompanhamento profissional é essencial.
9. Ameaças de suicídio nunca são "apenas para chamar atenção": segundo o CVV, toda menção, ameaça ou sinal de desejo de morte expressa sofrimento intenso e pedido de ajuda, devendo sempre ser levada a sério.
10. Ambivalência na ideação suicida: a pessoa que pensa em suicídio geralmente não quer acabar com a própria vida, mas sim acabar com uma dor que parece insuportável — convivendo o desejo de alívio com o desejo de viver de outra forma.
11. Falar sobre suicídio não aumenta o risco: abordar o assunto com cuidado, ética e acolhimento não induz ao ato; pelo contrário, rompe o tabu, alivia a angústia e abre espaço para buscar ajuda.

## Mitos e Fatos sobre Álcool, Drogas e Vida Universitária (Itens 12 a 15)
12. Uso abusivo de álcool e outras drogas e risco suicida: substâncias psicoativas afetam o sistema nervoso central, alteram o humor, aumentam a impulsividade e podem potencializar crises e ideação suicida.
13. Diferença entre uso e abuso de álcool: o portal diferencia o consumo recreativo moderado do uso abusivo e do binge drinking (beber pesado episódico), destacando a estratégia de redução de danos e o cuidado sem estigma.
14. Papel da universidade diante da competitividade: a lógica produtivista e competitiva pode adoecer, cabendo à universidade assumir postura acolhedora, coletiva e promotora de vínculos solidários.
15. Sobre a frase "A universidade mata": o portal contextualiza dados da OMS (aumento de 18% na depressão entre 2005 e 2015) e da V Pesquisa Nacional de Perfil Socioeconômico e Cultural da Andifes (2018), mostrando que o sofrimento estudantil resulta da interação entre vulnerabilidades prévias, contexto socioeconômico e pressões acadêmicas — exigindo esforço institucional coletivo e políticas permanentes de cuidado.

## Depoimentos e Mostra Saúde Mental e Arte: Perspectivas
A seção Depoimentos reúne relatos em vídeo de membros da comunidade acadêmica da UFMG (Luana Contiero, Mayara Mello, Helbert Oliveira, Movimento Redes, Letícia Ribeiro, Pedro Caldeira e Centro Acadêmico Afonso Pena — CAAP) compartilhando vivências de acolhimento e superação.
A mostra Saúde Mental e Arte: perspectivas valoriza a expressão artística como cuidado e elaboração subjetiva, reunindo dezenas de obras de estudantes, servidores e artistas da comunidade (pinturas, mandalas, nanquim, aquarelas, colagens, poesias, crônicas, contos, fotografia, música e vídeo-dança como Fine Lune) sobre temas como pandemia, ansiedade, depressão, neurodiversidade, identidade, quilombo e luta antimanicomial.`
  ),

  makeUfmgDoc(
    'doc-samia-ufmg-2',
    'Portal Saúde Mental UFMG — Situações de Sofrimento (Depressão, Estresse, Ansiedade, Psicoses, Burnout), Suicídio e Grupo GAES',
    'ufmg_saudemental_sofrimento_suicidio.md',
    'rag_vector',
    `# Situações de Sofrimento Psíquico e Prevenção ao Suicídio (Portal UFMG)

## Depressão — Dados OMS e Olhar Social
Segundo relatório da OMS (2015), a depressão cresceu 18,4% entre 2005 e 2015, afetando cerca de 4,4% da população mundial (322 milhões de pessoas) e 5,8% da população brasileira. Caracteriza-se por desânimo persistente, ausência de prazer nas atividades cotidianas, sentimento de vazio e inutilidade, lentidão corporal e mental e falta de sentido na vida.
O portal articula a depressão também como sintoma social do mal-estar contemporâneo: Christian Dunker (2016) relaciona o sofrimento às cobranças capitalistas e às relações de trabalho e estudo; Maria Rita Kehl (2009, 2017) distingue depressão de tristeza ou luto situacional, chamando-a de expressão que desafina o "coro dos contentes" numa cultura que impõe felicidade obrigatória nas redes sociais; Maria Livia Moretto (2016) alerta para o apagamento da singularidade na sociedade de consumo; e Vladimir Safatle (2015) aponta o sofrimento como impulso crítico, e não mera patologia individual.

## Estresse Natural versus Estresse Crônico Negativo
O estresse é um padrão de resposta física ou emocional a fatores que perturbam o equilíbrio do organismo. Em grau mínimo, é natural e necessário para a sobrevivência e para enfrentar desafios cotidianos. Contudo, sob condições desfavoráveis contínuas no ambiente acadêmico, profissional, familiar ou social, torna-se estresse crônico negativo, gerando desequilíbrio orgânico e doenças. A OMS (2013) reconhece que o estresse atinge mais de 90% da população mundial, associado a excesso de trabalho, falta de descanso e ambientes desfavoráveis.

## Ansiedade e Angústia Existencial
Segundo relatório da OMS (2017), a ansiedade afeta 264 milhões de pessoas no mundo (alta de 14,9% entre 2005 e 2015), e o Brasil apresenta taxa de 9,3% da população, muito acima da média global. Manifesta-se por medo vago, apreensão, tensão, dificuldade de relaxar e concentrar, cansaço e insônia, podendo evoluir para fobias, TOC, estresse pós-traumático e ataques de pânico.
Na leitura existencial-humanista apresentada pelo portal (Sartre, Rollo May, Viktor Frankl, Irvin Yalom e Melo 2016), o excesso contínuo de informações e cobranças amplifica a angústia existencial ligada à liberdade de escolha. Respostas permanentes de fuga, evitação ou entorpecimento tornam a ansiedade patológica; já o enfrentamento criativo, a autenticidade, a construção de sentido, o trabalho significativo, a fé e a arte constituem caminhos saudáveis de elaboração.

## Loucura, Psicoses e Luta Antimanicomial
O portal apresenta três enfoques históricos da loucura: (1) mitológico-religioso (Idade Média ao Renascimento, forças divinas ou demoníacas, quando os loucos ainda eram ouvidos); (2) passional ou psicológico (Renascimento, loucura como "desrazão" e confinamento em asilos com silenciamento moral); e (3) organicista (século XIX, apropriação médica e manicômios, transformando a exclusão em questão médica — Providello e Yasui, 2013).
Na virada do século XIX para XX, Freud introduz o inconsciente. No Brasil dos anos 1980, a Luta Antimanicomial instaura a Reforma Psiquiátrica Brasileira, colocando a cidadania e o cuidado psicossocial em liberdade no centro (Oliveira Silva, 2007). As psicoses afetam cerca de 1% a 3% da população e envolvem delírios (alterações do pensamento), alucinações (alterações da percepção) e alterações da consciência do eu (SES-MG, 2006).

## Esquizofrenia e Abordagem em Crise Psicótica
A esquizofrenia é uma forma clínica da psicose caracterizada por distorções no pensamento, percepção, emoções, linguagem, consciência do eu e comportamento, incluindo alucinações e delírios (OMS, 2013). Pessoas com esse diagnóstico sofrem intenso estigma e risco de violações de direitos humanos.
Em situações de crise (desorganização psíquica), a pessoa pode sentir medo e agitação por vivenciar delírios e alucinações de forma muito concreta. Deve-se manter a calma, conversar de maneira apaziguadora — preferencialmente por alguém com quem a pessoa já tenha vínculo —, respeitar sua autonomia perguntando como e onde prefere ser cuidada, e encaminhar para serviços abertos da RAPS: CAPS ou, em Belo Horizonte, CERSAM.

## Síndrome de Burnout (Esgotamento Profissional)
Definida pelo psicanalista Herbert Freudenberger nos anos 1970, a Síndrome de Burnout (esgotamento profissional) é um agravo psicossocial multidimensional com três dimensões (Maslach, Schaufeli e Leiter, 2001): (1) exaustão emocional (falta de energia e esgotamento afetivo); (2) despersonalização (insensibilidade emocional e distanciamento frio como defesa); e (3) baixa realização profissional (autoavaliação negativa, sensação de incompetência e queda de autoestima).
Decorre do desequilíbrio prolongado entre exigências elevadas e falta de suporte no ambiente de trabalho ou estudo, levando a absenteísmo, queda de produtividade e deterioração da saúde (Batista et al., 2010; Tamayo e Tróccoli, 2002). O enfrentamento exige mudanças organizacionais, sensibilização de gestores, respeito às individualidades, busca precoce por ajuda profissional e autocuidado (atividade física, lazer e reformulação de metas).

## Suicídio — Fatores de Risco e Sinais de Alerta
O suicídio é um fenômeno complexo, multifatorial e questão de saúde pública: segundo a OMS, mais de 800 mil pessoas morrem por suicídio a cada ano no mundo (uma a cada 40 segundos). Não resulta de uma causa única, mas do acúmulo de fatores sociais, culturais, psicológicos e ambientais.
Principais fatores de risco apontados pela literatura no portal: negligência ou abuso sexual na infância, sentimento de culpa, desesperança e falta de projetos de vida, alta recente de internação psiquiátrica, doenças incapacitantes, impulsividade ou agressividade, isolamento social, histórico de suicídio na família, automutilação e tentativas anteriores, transtornos psiquiátricos, uso abusivo de álcool e outras drogas, discriminação por orientação sexual ou identidade de gênero, agressões, perda de emprego e crises graves.
Sinais de alerta que nunca devem ser ignorados: falas como "não consigo encontrar uma solução", "vocês ficariam melhores sem mim", "eu não aguento mais", "vou desaparecer", "vou deixar você em paz", "queria dormir e não acordar nunca mais", desesperança intensa, perda de prazer, ausência das atividades habituais, isolamento súbito e preocupação constante com a própria morte.

## Suicídio — Como Ajudar, O Que Não Fazer e Grupo GAES (Posvenção UFMG)
O que se DEVE fazer diante de alguém sob risco de suicídio: aproximar-se e colocar-se disponível para ouvir e apoiar sem julgamentos; incentivar a busca por ajuda profissional e oferecer-se para acompanhar; não deixar uma pessoa em risco iminente sozinha e acionar imediatamente emergência (SAMU 192, UPA, CERSAM/CAPS ou DAST); restringir acesso a meios letais; manter contato contínuo e indicar o CVV pelo telefone 188 (gratuito, 24 horas, sigiloso, em todo o Brasil).
O que NÃO se deve fazer: condenar ou julgar ("é covardia", "é frescura", "é loucura"); banalizar ("já passei por coisas piores"); acusar ("quer chamar atenção", "falta Deus"); dar sermões ou usar frases de otimismo tóxico ("levanta a cabeça", "pense positivo", "a vida é boa").
Apoio aos enlutados (posvenção): a Faculdade de Medicina da UFMG abriga o Grupo de Apoio a Enlutados por Suicídio da UFMG (Grupo GAES), projeto de extensão voltado a familiares e amigos enlutados por suicídio. Contato e inscrições pelo e-mail gaesufmg@gmail.com.

## Filmes e Documentários Recomendados pelo Portal UFMG
O portal recomenda 12 obras audiovisuais sobre saúde mental e dignidade humana: (1) Fine Lune e (2) Un pas de côté (sobre dança e autismo), ambos com participação da EBA/UFMG; (3) Dá pra fazer (Si può fare, 2008, sobre as cooperativas na Itália pós-Basaglia); (4) Garota Interrompida; (5) As Horas; (6) Cisne Negro; (7) Saúde Mental e Dignidade Humana (documentário da OAB); (8) Ônibus 174; (9) Precisamos falar sobre o Kevin; (10) Estamira (interseções entre gênero, raça, classe, território e saúde mental); (11) Bicho de Sete Cabeças (internação compulsória e patologização); e (12) Nise – O Coração da Loucura (tratamento humanizado e arte por Nise da Silveira).`
  ),

  makeUfmgDoc(
    'doc-samia-ufmg-3',
    'Portal Saúde Mental UFMG — Política de Saúde Mental, CPSM, Semanas de Saúde Mental, Enasam-U, Deficiência Psicossocial e Parceiros',
    'ufmg_saudemental_politica_cpsm_semanas.md',
    'rag_vector',
    `# Política de Saúde Mental da UFMG, CPSM, Pesquisas e Eventos

## Histórico da Política de Saúde Mental e Comissão Permanente (CPSM)
A construção da Política de Saúde Mental da UFMG inclui marcos como o PASME, a criação da Rede de Saúde Mental da UFMG em 2014 (vinculada à Universidade dos Direitos Humanos — UDH/PROEX), a Comissão de Inclusão e Saúde Mental (CISME, 2015–2016, Portarias 079/2015 e 001/2016), a Comissão de Acompanhamento no ICA em Montes Claros (2017) e a instituição da Comissão Permanente de Saúde Mental (CPSM) em 2018.
A CPSM (seção Quem somos) é presidida pelo Reitor Prof. Alessandro Fernandes Moreira e integra representantes de técnico-administrativos (FAFICH/NAD), iniciativas de escuta (CEGRAD/ICB), discentes de graduação e pós-graduação, coordenação técnica docente (Escola de Enfermagem), PRORH (DAF e DAST), PRAE, PROGRAD, PRPG e NAI.

## 4 Princípios e 4 Diretrizes da Política de Saúde Mental da UFMG
Os 4 Princípios norteadores são: (I) Universidade para todos; (II) Protagonismo das pessoas com experiência de sofrimento mental; (III) Respeito à vida e à ética; (IV) Sintonia e defesa do SUS, da Lei nº 10.216/2001 (Reforma Psiquiátrica), da Política de Atenção à Saúde e Segurança do Trabalho do Servidor Público Federal (PASS) e da Política de Direitos Humanos da UFMG (Resolução nº 09/2016).
As 4 Diretrizes são: (1) construção coletiva e participativa abrangendo estudantes brasileiros e estrangeiros, servidores docentes e TAEs, trabalhadores terceirizados e familiares; (2) desestigmatização e despatologização sob perspectiva antimanicomial; (3) promoção da qualidade de vida e de um ambiente não adoecedor; e (4) enfrentamento ao autoritarismo, ao individualismo e ao produtivismo.
Entre as 7 ações estruturantes estão: visitas às unidades acadêmicas, realização anual das Semanas de Saúde Mental, mapeamento das ações existentes, apoio técnico-pedagógico, diretrizes para núcleos de escuta, acolhimento a distância e Programa Universidade Acolhedora.

## Semanas de Saúde Mental e Inclusão Social da UFMG (I a XIV, 2013–2026)
Celebradas anualmente em maio em sintonia com o Dia Nacional da Luta Antimanicomial (18 de maio), as Semanas de Saúde Mental e Inclusão Social da UFMG são organizadas pela Rede de Saúde Mental (UDH/PROEX) com apoio da CPSM e de movimentos sociais (contato UDH/PROEX: udh@proex.ufmg.br, telefone (31) 3409-6435).
Edições mais recentes: IX Semana (2021, online, tema "Vida: Mutirão de Todes", enfoque interseccional); X Semana (2022, híbrida, tema "O Cuidado em Saúde Mental como Direito à Cidadania"); XI Semana (2023, presencial nos campi Pampulha e Saúde, tema "Saúde Mental é Democracia", debates sobre capacitismo, autismo e "Produtivismo, Adoecimento e Pesquisa"); XII Semana (2024, tema "Do rio ao mar...", reflexões sobre os 100 anos de Franco Basaglia); XIII Semana (2025, tema "Ainda lutamos aqui", com conferência de Sônia Barros do Ministério da Saúde, convidados da rede internacional WUN, resultados preliminares do 1º Censo de Saúde Mental da UFMG, piquenique para mães cientistas e cortejo da escola de samba "Liberdade Ainda que Tam Tam"); e XIV Semana (2026, tema "Democracia e cuidado: por um tempo de delicadeza").

## Pesquisa, Extensão e Estudo Nacional Enasam-U (Renasam)
A produção acadêmica em saúde mental pode ser consultada no Repositório Institucional da UFMG e nas ações da PROEX. A UFMG aderiu ao primeiro Estudo Nacional de Saúde Mental das Universidades (Enasam-U), coordenado por pesquisadores da UFRGS (Flávio Kapczinski) e da Fiocruz com apoio do CNPq e da Rede Nacional de Saúde Mental (Renasam, lançada em maio de 2024).
O Enasam-U mapeia as condições de saúde mental de estudantes e servidores de 18 a 75 anos em 50 universidades públicas brasileiras (14 no Sudeste, incluindo a UFMG), prevendo cerca de 15 mil voluntários em duas etapas: questionário online para participantes sorteados aleatoriamente e entrevistas diagnósticas por telessaúde, sob sigilo e aprovação de Comitê de Ética em Pesquisa.

## Deficiência Psicossocial e Lei Brasileira de Inclusão (LBI)
O portal promove o diálogo entre a Política Antimanicomial e a Lei Brasileira de Inclusão (LBI, Lei nº 13.146/2015), baseada na Convenção Internacional sobre os Direitos da Pessoa com Deficiência, que reconhece deficiências física, mental, intelectual e sensorial. Na aula aberta promovida com o NAI e a CPSM (com participação de Eduardo Mourão Vasconcelos da UFRJ, Laura Camey Fusaro da ASUSSAM-MG, Cristiano Rodrigues da Silva do NAI e Profa. Teresa Kurimoto da Enfermagem/CPSM), discute-se como garantir direitos, acessibilidade e inclusão universitária para pessoas com deficiência psicossocial e sofrimento psíquico grave.

## Cartilhas e Parceiros da Política de Saúde Mental na UFMG
Cartilhas divulgadas pelo portal: Trilhas do Cuidado: Escuta e acolhimento na UFMG; Cartilha Setembro Amarelo: mês de prevenção ao suicídio (Faculdade de Medicina UFMG); Assédio é crime: não se cale (Faculdade de Medicina UFMG); campanha da OMS World Mental Health Day #40seconds; Manual e Cartilha de Ajuda e Suporte Mútuos em Saúde Mental (Projeto Transversões / ESS-UFRJ); e Joy and Stress Triggers (Cactus Foundation).
Parceiros institucionais e representativos: AMMU (Associação Mineira de Mulheres Universitárias), DCE (Diretório Central dos Estudantes), MUDI (Movimento Universitário de Inclusão), APG (Associação de Pós-Graduandos — com atenção especial a PcD, pessoas negras, LGBTQIA+ e vulneráveis socioeconômicos), APUBH (Sindicato dos Professores — Núcleo de Acolhimento e Diálogo / NADi), ATENS UFMG e SINDIFES.`
  ),

  makeUfmgDoc(
    'doc-samia-ufmg-4',
    'Portal Saúde Mental UFMG — Rede de Apoio: Canais de Acolhimento nas Unidades Acadêmicas e Espaços de Convivência',
    'ufmg_saudemental_canais_acolhimento_convivencia.md',
    'rag_vector',
    `# Rede de Apoio UFMG — Canais de Acolhimento nas Unidades e Espaços de Convivência

## Onde Buscar Ajuda: Diferença entre Acolhimento e Atendimento Especializado
Na UFMG, o acolhimento é o princípio primeiro do cuidado: consiste em escuta qualificada, orientação sobre inclusão e permanência estudantil e construção de alternativas dentro das unidades acadêmicas. Já os canais de atendimento especializados oferecem consulta médica, atendimento psiquiátrico ou psicoterapia clínica (como DAST, FUMP, SPA-Fafich, Plantões Psicológicos e rede RAPS/SUS). Em emergências, deve-se acionar imediatamente o DAST, SAMU 192, Bombeiros 193 ou CERSAM/UPA.

## Canais de Acolhimento: Coltec, Engenharia, FACE e Farmácia
- Coltec (SEAP — Setor de Apoio Pedagógico): telefones (31) 3409-4939, (31) 98689-2052 e (31) 98689-2059, atendimento das 9h às 22h.
- Escola de Engenharia (NAAENG — Núcleo de Acolhimento e Acompanhamento): telefone (31) 3409-1891, e-mail acolhimento@eng.ufmg.br, de segunda a sexta-feira das 10h às 17h.
- FACE (Escuta Integrada): telefone (31) 3409-7064, e-mail eiface@face.ufmg.br, das 9h às 12h e das 14h às 16h (atende estudantes e servidores).
- Faculdade de Farmácia (Escuta Fafar): telefone (31) 3409-6741, e-mail assessoriaeducacional@farmacia.ufmg.br.

## Canais de Acolhimento: FAFICH, Letras (FALE), Medicina (Cegrad) e FAE
- FAFICH (NAD — Núcleo de Apoio Discente): telefone (31) 3409-5049, e-mail nad@fafich.ufmg.br, de segunda a sexta-feira das 9h às 16h (também acolhe servidores).
- Faculdade de Letras — FALE (SAEL): telefone (31) 3409-7475, e-mail sael@letras.ufmg.br, atendimento de 10h às 12h, 14h às 17h e 18h às 19h.
- Faculdade de Medicina (Assessoria de Escuta Acadêmica — Cegrad): acolhe estudantes de Medicina, Fonoaudiologia e Radiologia em dificuldades acadêmicas, sofrimento psíquico, vulnerabilidade social ou conflitos; telefones (31) 3409-9659 e (31) 3409-9664, e-mail escutaacademica@medicina.ufmg.br, das 10h às 12h30 e das 13h30 às 16h.
- Faculdade de Educação — FAE (Núcleo de Escuta / Fale com a FAE): telefone (31) 3409-7477, e-mail ouvidoria@fae.ufmg.br.

## Canais de Acolhimento: ICEx (EspaçAMente), ICB, PRAE e ICA Montes Claros
- ICEx (EspaçAMente): e-mail acolhimento@icex.ufmg.br; funciona segunda, terça, quarta e sexta das 7h30 às 16h30 e quinta das 10h30 às 19h30, em modalidade presencial ou remota, com ou sem agendamento prévio.
- ICB (Projeto Escuta): contato pelo e-mail projetoescutaufmg@gmail.com.
- PRAE (Setor de Acolhimento e Orientação a Estudantes): telefones (31) 3409-3862, (31) 3409-3122 e (31) 3409-4178, e-mail orientacaoestudantes@prae.ufmg.br; segunda a sexta das 9h às 17h (segundas e quartas com atendimento estendido até 18h30).
- ICA — Campus Montes Claros: Saúde do Trabalhador pelo telefone (38) 2101-7979 (segunda a quinta das 7h às 21h e sexta das 7h às 19h), Psicologia pelo telefone (38) 2101-7709 e Serviço Social pelo telefone (38) 2101-7784 (segunda a sexta das 7h30 às 16h30).

## Espaços de Convivência nos Campi da UFMG (10 locais)
A UFMG incentiva o uso de espaços de convivência, descanso, natureza e encontro comunitário como promoção de saúde mental:
1. Jardim Mandala (Faculdade de Educação — FAE, Campus Pampulha).
2. Jardins do Setorial II (Campus Pampulha).
3. Bosques da Reitoria e da Escola de Música (Campus Pampulha).
4. Praça de Serviços (Campus Pampulha).
5. Estação Ecológica da UFMG (114 hectares de área verde preservada na Pampulha).
6. Diretórios e Centros Acadêmicos (DAs e CAs das unidades).
7. Ilhas de Conforto da Faculdade de Medicina (do 2º ao 8º andar, Campus Saúde).
8. Território Livre da Faculdade de Direito (Centro de Belo Horizonte).
9. Jardins da Escola de Arquitetura (região da Savassi, Belo Horizonte).
10. Espaço do Dominó no ICA (Campus Montes Claros).`
  ),

  makeUfmgDoc(
    'doc-samia-ufmg-5',
    'Portal Saúde Mental UFMG — Crises, Atendimento Especializado (DAST, FUMP, SPA, Plantões, DAF) e Rede RAPS/SUS',
    'ufmg_saudemental_crises_atendimento_raps.md',
    'direct_context',
    `# Orientações para Crises, Atendimento Especializado UFMG e Rede RAPS/SUS

## Orientações para Crises e Emergências na UFMG (DAST, CVV, SAMU, Bombeiros)
O Departamento de Atenção à Saúde do Trabalhador (DAST) atende emergências de estudantes, servidores e qualquer pessoa presente nas dependências da UFMG (e-mail geral sast@prorh.ufmg.br; telemedicina e acolhimento acolhimentodast@gmail.com):
- DAST Pampulha: Av. Antônio Carlos, 6627, Unidade Administrativa II; telefones (31) 3409-4499 e (31) 3409-4315; segunda a sexta das 7h às 22h (exceto sábados, domingos e feriados). É a única unidade com ambulância e sala de observação.
- DAST Centro: Al. Álvaro Celso, 175, 7º andar, Santa Efigênia (atende Campus Saúde, Direito e Arquitetura); telefone (31) 3307-9564; segunda a sexta das 7h às 19h.
- Emergências 24 horas: CVV (Centro de Valorização da Vida) 188 (gratuito e sigiloso); SAMU 192; Corpo de Bombeiros 193; Polícia Militar 190; Central de Atendimento à Mulher 180.

## Canais de Atendimento Especializados Internos da UFMG
- FUMP (Fundação Universitária Mendes Pimentel): psicoterapia de curta duração para estudantes assistidos nos níveis I, II e III em Belo Horizonte (Av. Antônio Abrahão Caram, 610 — tels (31) 3409-8401 e (31) 3409-8470) e Montes Claros (Av. Universitária, 1000 — tels (38) 3213-9867 e (38) 2101-7926), além de atendimentos na FALE às terças (12h30–18h30) e quintas (14h30–18h30); e-mail comunica@fump.ufmg.br.
- SPA-Fafich (Serviço de Psicologia Aplicada — clínica-escola): Fafich sala 2062; telefone (31) 3409-5070; e-mail spa@fafich.ufmg.br; segunda a sexta das 8h às 12h e das 13h30 às 17h.
- Plantão Psicológico UFMG: gratuito para a comunidade interna, com inscrições às terças e quintas das 12h30 às 14h30.
- Plantão Psicológico CAAP (Faculdade de Direito): sala 512 da Pós-Graduação; telefone (31) 3409-8629; e-mail contato@caap.org.br; segundas e quartas das 11h às 18h.
- Napem (Faculdade de Medicina): apoio psicopedagógico, Tutoria e MedCine; sala 39 térreo; telefone (31) 3409-9696; e-mail napem@medicina.ufmg.br.
- Escuta Profissional ICA (Montes Claros): telefone (38) 2101-7709, segunda a sexta das 8h às 15h.
- DAF (Servidores docentes, TAEs e Programa PORTA): Divisão de Acompanhamento Funcional no DRH (Unidade Administrativa III, sala 113); telefones (31) 3409-4497 e (31) 3409-3242; e-mail daf@drh.ufmg.br; plantão sem agendamento de segunda a sexta das 8h às 11h30 e das 13h às 18h30.

## Rede Externa RAPS / SUS — Belo Horizonte e Montes Claros (CERSAM, CAPS e UPA)
Serviços gratuitos de cuidado em liberdade do SUS (além das UBS e equipes de Estratégia Saúde da Família — ESF):
- Região Pampulha / Noroeste (BH): CERSAM Pampulha (Rua do Mel, 77, Santa Branca — (31) 3277-7918 / 3277-7934); CERSAM AD Pampulha para álcool e drogas (Rua Lugúria, 70, Bandeirantes — (31) 3277-1574 / 3277-1575); CERSAMI Noroeste infantojuvenil (Rua Camarugi, 10, Padre Eustáquio — (31) 3277-9279); UPA 24h Pampulha (Av. Santa Terezinha, 515, Jardim Leblon, referência noturna das 19h às 7h).
- Região Centro-Sul / Leste (BH): CERSAM Leste (Rua Pirite, 150, Santa Tereza — (31) 3277-5756 / 3277-5743); CERSAM AD Centro-Sul / CMT (Al. Ezequiel Dias, 365, Santa Efigênia — (31) 3217-9000); CERSAMI Centro-Sul / CPAI (Rua Padre Marinho, 150, Santa Efigênia — (31) 3235-3000); UPA 24h Centro-Sul (Rua Domingos Vieira, 488, Santa Efigênia, referência noturna das 19h às 7h).
- Montes Claros: CAPS TM (Av. Donato Quintino, 341, Cidade Nova — (38) 3229-3330 / 3229-3380 / 3221-2328) e CAPS AD (Rua Gonçalves Figueira, 202, Centro — (38) 3221-9633).`
  ),

  makeUfmgDoc(
    'doc-samia-ufmg-6',
    'Portal Saúde Mental UFMG — Para Estudantes e Servidores: Inclusão (NAI), Diversidade, Cultura de Paz, Assédio e Qualidade de Vida',
    'ufmg_saudemental_estudantes_servidores.md',
    'rag_vector',
    `# Para Estudantes e Servidores na UFMG — Inclusão, Diversidade, Paz e Qualidade de Vida

## Você Não Está Sozinho e Universidade Acolhedora
A UFMG soma quase 9 milhões de metros quadrados distribuídos em três cidades, o que pode gerar sensação inicial de solidão ou desorientação em estudantes e servidores (como apontou o relatório da CISME de 2016). Quatro orientações práticas do portal ajudam na adaptação: situar-se nos espaços, informar-se sobre serviços e direitos, explorar o campus e nunca ter vergonha de pedir ajuda.
Inspirada na Política Nacional de Humanização (PNH — dimensões ética, estética e política), a universidade valoriza o esporte, a cultura e o convívio como estratégias de cuidado, citando iniciativas como Movimento Redes (Medicina), Viver UFMG, Assufemg, Liga das Atléticas, Programa Envelhecimento Ativo (EEFFTO/PRORH) e Projeto Vida mais Viva (Medicina).

## Universidade Inclusiva — NAI, MUDI e Transporte Acessível
O Núcleo de Acessibilidade e Inclusão (NAI-UFMG, Portaria 015/2015 e Decreto nº 7.611/2011) promove inclusão de estudantes e servidores com deficiência (atendendo cerca de 490 estudantes PcD e cerca de 138 servidores PcD), contando com Centro de Atendimento ao Deficiente Visual e equipe de intérpretes de Libras, em diálogo com a Lei de Cotas nº 13.409/2016.
Estudantes também se articulam no MUDI (Movimento Universitário de Inclusão, criado em 2019). A UFMG disponibiliza transporte acessível no Campus Pampulha pelo telefone (31) 3409-3927, prevê regime acadêmico especial nas Normas Gerais de Graduação e oferece suporte funcional a servidores PcD pela DAF ((31) 3409-3242 / daf@drh.ufmg.br).

## Promovendo a Diversidade — Estresse de Minoria, CCN, NUH e Colar
O portal aborda a Teoria do Estresse de Minoria (minority stress theory), explicando como o estigma e o preconceito contínuos elevam o sofrimento psíquico em grupos minorizados. Cita a pesquisa The Trevor Project (2019), na qual 39% dos jovens LGBTQ e 54% das pessoas trans ou não-binárias relataram já ter considerado suicídio, além do impacto do racismo estrutural e da força protetiva do aquilombamento.
Espaços e núcleos de referência na UFMG: Centro de Convivência Negra (CCN), localizado no 1º andar da Fafich; NUH (Núcleo de Direitos Humanos e Cidadania LGBT); Colar UFMG (no Campus Saúde); e articulação com a Frente Autônoma LGBT de Belo Horizonte. Casos de discriminação podem ser denunciados à Ouvidoria da UFMG ((31) 3409-6466 / ouvidoria@ufmg.br).

## Por uma Cultura de Paz e Comunicação Não-Violenta
Retomando o Movimento Global da ONU (1999) e o Manifesto da Unesco por uma Cultura de Paz e Não-Violência, o portal propõe seis caminhos práticos no cotidiano universitário: respeitar a vida; rejeitar a violência; ser generoso; ouvir para compreender; preservar o planeta; e redescobrir a solidariedade.
No ambiente universitário, isso começa em gestos simples como um "bom dia", na escuta genuína, na comunicação não-violenta, em avaliações contextualizadas que superem o individualismo competitivo, na construção conjunta de regras de convivência e na valorização da alteridade em questões de gênero, raça, identidade e orientação sexual.

## Relações Interpessoais, Enfrentamento ao Assédio e Ouvidoria da UFMG
O portal combate a lógica adoecedora de "sofrer para aprender ou melhorar" e destaca iniciativas comunitárias como o Encontro de Ideias e oficinas de lazer da Escola de Veterinária. Diferencia assédio moral (comportamento repetitivo de humilhação, desqualificação e constrangimento direcionado) de assédio sexual (crime caracterizado por qualquer constrangimento de conotação sexual no ambiente de trabalho ou estudo).
Ressalta o recorte de gênero e raça (mulheres, especialmente mulheres negras, são as principais vítimas) e reafirma que a culpa nunca é da vítima. Denúncias institucionais — identificadas ou anônimas — devem ser encaminhadas à Ouvidoria da UFMG: telefone (31) 3409-6466, e-mail ouvidoria@ufmg.br, atendimento das 7h30 às 19h na Biblioteca Central, 3º andar, sala 302 (Campus Pampulha), sem prejuízo de denúncia criminal em delegacias (190), Central de Atendimento à Mulher (180) ou Ministério Público de Minas Gerais.

## Qualidade de Vida no Ambiente Acadêmico (Estudantes)
Estudantes enfrentam reprovações, competitividade intensa, cobrança por um "padrão de excelência" e, na pós-graduação, fenômenos como o bloqueio de escrita (estudado por Robson Cruz). O portal propõe quatro pilares protetivos: conciliar lazer e estudo; priorizar amizade em vez de concorrência; cultivar contatos físicos e afetivos presenciais; e lembrar sempre que a vida é muito maior do que o desempenho acadêmico. Também recomenda práticas como o Projeto Kundalini Yoga e o conhecimento dos direitos estudantis nas Normas Gerais de Graduação (Resolução CEPE nº 01/2018).

## Qualidade de Vida no Trabalho (Servidores Docentes e TAEs)
Segundo o DAST, o sofrimento mental é a principal causa de afastamento de servidores na UFMG. Docentes frequentemente acumulam funções de ensino, pesquisa e gestão sob forte produtivismo acadêmico (avaliações focadas em quantidade em vez de qualidade). Técnico-administrativos (TAEs) relatam ansiedade diante de indefinição de atribuições, acúmulo de tarefas ou ócio forçado, agravados pelo silêncio e medo de punição.
Servidores docentes, TAEs e terceirizados também podem buscar núcleos de escuta nas unidades (como Fale com a FAE, NAD-Fafich e Escuta Integrada da FACE) e, de forma preventiva e sem receio de represálias, a DAF (Divisão de Acompanhamento Funcional — DRH, Unidade Administrativa III, sala 113; daf@drh.ufmg.br; (31) 3409-4497; plantão sem agendamento das 8h às 11h30 e 13h às 18h30), que atua por mediação, diálogo e socialização organizacional.`
  ),

  makeUfmgDoc(
    'doc-samia-ufmg-7',
    'Portal Saúde Mental UFMG — Família e Amigos: Como Ajudar em Crises e Relato de Cuidado em Liberdade (ASUSSAM-MG)',
    'ufmg_saudemental_familia_amigos_crise.md',
    'rag_vector',
    `# Família e Amigos — Como Ajudar em Crises e Cuidado em Liberdade (Portal UFMG)

## O que é uma Crise em Saúde Mental?
Após a Reforma Psiquiátrica brasileira, a crise em saúde mental deixou de ser escondida nos manicômios e passou a ser cuidada em sociedade. Define-se crise como qualquer situação em que o comportamento de uma pessoa a impeça de cuidar de si mesma, a coloque em risco de ferir a si ou a outras pessoas, ou reduza sua capacidade doméstica e laborativa.
Mais do que a gravidade objetiva de um acontecimento (como luto, término afetivo ou excesso de estresse), a crise depende da subjetividade e da forma como cada pessoa vivencia e elabora o sofrimento. Muitas vezes, uma escuta atenta e sem julgamentos já produz efeito apaziguador imediato.

## Protocolo para Família e Amigos: O que Fazer em Cada Tipo de Crise
- Crises mais leves: procurar a Unidade Básica de Saúde (UBS) de referência ou escuta qualificada.
- Crises moderadas/graves e pensamentos de morte (com ou sem planejamento): nunca banalizar nenhum sentimento; ouvir, expressar preocupação, tranquilizar e não julgar — frases como "Você não está sozinho, estou preocupado com você" ajudam a apaziguar a dor. Buscar avaliação profissional urgente nos serviços abertos da RAPS-SUS: CERSAM (em Belo Horizonte) ou CAPS (região metropolitana e demais municípios), que promovem o cuidado em liberdade preservando cidadania e autonomia.
- Ameaça concreta à própria vida ou de terceiros, hostilidade, agitação intensa crescente ou tentativa de autoextermínio presenciada: NÃO confrontar verbal nem fisicamente, pois isso aumenta a vulnerabilidade. Dentro da UFMG, acionar imediatamente a Vigilância Universitária, o Corpo de Bombeiros (193) e o SAMU (192). Para dúvidas ou acolhimento em saúde na UFMG, acionar o DAST Pampulha pelo (31) 3409-4499 (segunda a sexta das 7h às 22h).
- Intoxicação exógena (ingestão excessiva de medicamentos, álcool, substâncias químicas ou outras drogas com repercussões como agitação, desmaio ou desorientação): encaminhamento imediato para UPA 24h ou SAMU (192).

## Relato de Cuidado em Família — Leida Maria de Oliveira Uematu (ASUSSAM-MG)
O portal traz o relato de Leida Maria de Oliveira Uematu, familiar e militante da Associação dos Usuários de Serviços de Saúde Mental (ASUSSAM-MG), sobre como acompanhar uma pessoa em sofrimento psíquico grave sem reproduzir a lógica manicomial:
- Perceber pelo ouvir e observar com calma: prestar atenção inclusive quando a pessoa fica mais quieta; não se assustar e tratar o sofrimento mental com naturalidade, como qualquer outra condição de saúde.
- Preservar respeito, voz e autonomia: nunca infantilizar o adulto nem tirar seu direito à fala, opinião e participação nas tarefas do cotidiano (como servir o próprio prato ou participar de rodas de conversa e eventos familiares — jamais excluir). Não cobrar que a pessoa volte a ser "igual a antes".
- Praticar o cuidado indireto quando houver resistência: em vez de se impor ou ficar vigiando quem não aceita ajuda no momento, aproximar-se sem sufocar, conhecer os serviços abertos do SUS/RAPS (CERSAMs, Centros de Convivência), estudar sobre saúde mental e cuidar da própria saúde mental fazendo terapia para acolher o familiar com equilíbrio.`
  ),
];
