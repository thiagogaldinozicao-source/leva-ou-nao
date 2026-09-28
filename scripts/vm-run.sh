#!/usr/bin/env bash
# vm-run.sh -- build/teste deste projeto NA VM DE TESTE (tibiatest), nunca na maquina local
# (ordem do dono 2026-09-07: lokeyradar e AdmixBrasil rodam na VM, com PRIORIDADE, e a VM nunca trava;
#  2026-09-27: "roda os testes sempre na vm de testes pra n ocupar processo do pc").
# Copia fiel de vigia-juridico/scripts/vm-run.sh (a335c27b); melhoria vai LA' e volta pra ca'. O que muda entre projetos mora no vm-run.conf AO
# LADO (PROJ, excludes, lockfiles, receitas tier_*, QUICK_RE, HOME_FILES). Esta copia GENERALIZA o que
# as outras ainda hardcodam (e e' por isso que elas divergiram): tier = QUALQUER tier_* do conf, nunca
# lista fixa no case; os argumentos do pedido chegam ao tier (`gate regras,docs`); filtro do quick
# vem do conf. A fila e o /root/locks/prio/ sao COMPARTILHADOS com os outros repos: NAO renomear.
#
# Contrato (o do test-vm.sh do spike canary-browser-spike, versao enxuta):
#  - espelho POR CHECKOUT em /root/repos/<PROJ>-<ckid>/ (ckid = sha256 de hostname:path): N contas
#    e checkouts syncam sem se pisar; o que entra em FILA e' a rodada, nunca o rsync.
#  - rsync sem .git/node_modules/dist e sem .env* (so' .env.example viaja: segredo nao sai daqui).
#  - deps (npm ci...) so' quando o hash dos LOCKFILES muda (.vm-run/deps.sha no espelho).
#  - VERDE memoizado: espelho identico (caminho+tamanho+mtime) + pedido igual ao ultimo rc=0 nao roda
#    de novo (`.vm-run/green/<tier>` no espelho; VM_FORCE=1 forca). Vermelho roda sempre.
#  - HOME_FILES (conf, caminhos relativos a $HOME): o que um teste le de $HOME viaja pra
#    <espelho>/.vm-run/home/ a cada rodada (e entra no memo); o body exporta VM_HOME e o conf decide.
#  - `ambiente()` do conf (se existir) e' chamado pelo body antes de `-- <cmd>`: o comando avulso
#    enxerga o MESMO PATH/HOME das receitas (os tier_* chamam o seu por conta propria).
#  - rodada DESTACADA (setsid) com lease tocado a cada 15s, log+rc em <espelho>/.vm-run/; a ponta
#    local so' acompanha por polling reconectavel -- queda de ssh (ou timeout do Bash tool) NAO mata
#    a rodada: `vm-run.sh attach` volta a acompanhar, `vm-run.sh stop` mata.
#  - fila GLOBAL da VM (/root/locks/offline-suite.lock, a MESMA do spike) COM PRIORIDADE: enquanto
#    espera, deixa um ticket em /root/locks/prio/ e o test-vm.sh do spike cede a vez a ticket fresco.
#    So' RODADA INTEIRA (ou recurso exclusivo, ex. docker com porta fixa) entra na fila: quem decide e'
#    `fila_tier <tier> [args]` do conf (rc 0 = fila); gate ALVO (segundos) passa direto em vez de
#    esperar a suite de 10min de outro projeto (dono 2026-09-28: "testes tem q sempre ter gates e ser
#    super rapidos"). Mesmo discriminador do test-vm.sh do spike. Conf sem `fila_tier` = todo tier na fila.
#  - UMA rodada por vez com a VM INTEIRA (8 vCPU sem quota): scope com MemoryHigh=13G (desacelera e vai
#    pra swap antes de estourar), MemoryMax=15G de 15.6G, MemorySwapMax=6G (swap da VM = REDE, nao RAM de
#    trabalho) -- a rodada nunca morre por OOM seco nem derruba a caixa, e a fila segue andando, `timeout` duro, TMPDIR fora do tmpfs (/tmp da VM e' RAM),
#    servicos docker do e2e derrubados no fim (e no `stop`).
#  - saida enxuta: 1 linha de progresso por minuto + as ultimas VM_TAIL linhas do log + rc; o log
#    inteiro fica em <repo>/.vm-run/<PROJ>-<tier>.log (gitignored). Nunca cole o log no contexto.
#
# uso: vm-run.sh [all|<tier> [args...]|quick|status|stop|sync|attach|-- <cmd...>]   (default: all)
#   <tier> = qualquer tier_<nome> do vm-run.conf (sem argumento valido, o uso lista os tiers).
#   `-- <cmd>` roda no espelho SEM fila (comando leve: um spec, um tsc), ainda sob memcap/timeout.
#   `quick` roda so' os testes ligados ao diff local (vs origin/main + arvore suja), sem fila, segundos.
#   VM_HOST vazio (dono 09-28: "usar as VM pra teste tbm, ficar disponivel pra td") escolhe host do
#   POOL via `~/.claude/bin/vm-escolhe.sh` (score de carga real; ausente/sem resposta = tibiatest fixo).
#   Host != tibiatest ganha `teste.slice` PROPRIO (CPUWeight/IOWeight baixos, RAM <= 70% do host) pra
#   nao brigar com o que mais mora la' (ex. prod do tikagenda); uv/git/node/npm/rg se auto-instalam no
#   `ambiente()` do conf se a caixa for nova. `/var/tmp/$PROJ` (tmp da rodada) e' varrido no fim.
# env: VM_HOST=<vazio=pool|tibiatest|outro> VM_MEM_MIN=4096 VM_WAIT_S=7200 VM_RUN_MAX_S=3600 VM_MEM_MAX=15G VM_MEM_HIGH=13G VM_SWAP_MAX=6G VM_NODE_MB=4096 VM_TAIL=60
#      VM_FILA=auto|1|0 (forcar/dispensar a fila)  VM_FOLLOW=1 (stream do log em vez do progresso)
set -u
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
conf="$here/vm-run.conf"
[ -f "$conf" ] || { echo "!! $conf ausente"; exit 2; }
# shellcheck disable=SC1090
. "$conf"
: "${PROJ:?vm-run.conf sem PROJ}" "${TIERS_ALL:?vm-run.conf sem TIERS_ALL}"
root=$(git -C "$here" rev-parse --show-toplevel 2>/dev/null) || root=$(cd "$here/.." && pwd)
conf_rel=${conf#"$root"/}

wait_s=${VM_WAIT_S:-7200}
max_s=${VM_RUN_MAX_S:-3600}
mem=${VM_MEM_MAX:-15G}
memhigh=${VM_MEM_HIGH:-13G}
swapmax=${VM_SWAP_MAX:-6G}
tailn=${VM_TAIL:-60}
poll_s=15
ckid=$(printf '%s:%s' "$(hostname)" "$root" | sha256sum | cut -c1-8)
dir=/root/repos/$PROJ-$ckid
vr=$dir/.vm-run

# host: VM_HOST setado usa DIRETO (sem sonda, comportamento antigo). Vazio -> pool via vm-escolhe.sh
# (score de carga real dos hosts do dono 09-28; --mem 4096 = pico medido do `suite` inteiro em
# tibiatest, ~3,2G via memory.peak do cgroup + folga, >= 2048 pra tikagenda-root nunca ganhar suite
# rodando junto com prod; --quente pontua o host que ja' tem este espelho aquecido). Script ausente
# ou rc!=0 (ninguem respondeu) -> tibiatest calado, 1 linha.
if [ -n "${VM_HOST:-}" ]; then
	host=$VM_HOST
else
	escolhe="$HOME/.claude/bin/vm-escolhe.sh"
	host=''
	[ -x "$escolhe" ] && host=$("$escolhe" --mem "${VM_MEM_MIN:-4096}" --quente "$dir:2")
	if [ -z "$host" ]; then
		echo ">> vm-escolhe indisponivel ou sem resposta -- tibiatest (fixo)"
		host=tibiatest
	else
		echo ">> host escolhido do pool: $host"
	fi
fi
SSHK=(-o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
ssh_q() { ssh "${SSHK[@]}" "$host" "$@" </dev/null; }

modo=${1:-all}
[ $# -gt 0 ] && shift

# ------------------------------------------------------------------ status / stop
if [ "$modo" = status ]; then
	ssh "${SSHK[@]}" "$host" bash -s -- "$vr" "$PROJ" <<'REMOTO'
vr=$1; proj=$2
echo "-- VM: $(uptime | sed 's/.*load/load/')  $(free -m | awk 'NR==2{printf "RAM livre %d/%d MB", $7, $2}')"
if flock -n /root/locks/offline-suite.lock true 2>/dev/null; then echo "-- fila: LIVRE"
else echo "-- fila: OCUPADA (pid $(fuser /root/locks/offline-suite.lock 2>/dev/null | tr -s ' '))"; fi
t=$(find /root/locks/prio -maxdepth 1 -type f -mmin -2 -printf '%f ' 2>/dev/null); echo "-- prioridade esperando: ${t:-nenhum}"
if [ -d "$vr" ]; then
	rc=$(cat "$vr/rc" 2>/dev/null); l=$(stat -c %Y "$vr/lease" 2>/dev/null || echo 0); idade=$(( $(date +%s) - l ))
	if [ -n "$rc" ]; then est="rc=$rc"; elif [ "$idade" -le 120 ]; then est="RODANDO (lease ha ${idade}s)"; else est="morta sem rc (lease ha ${idade}s)"; fi
	echo "-- $proj: $(dirname "$vr") tier '$(cat "$vr/tier" 2>/dev/null)' runid $(cat "$vr/id" 2>/dev/null) -> $est"
else echo "-- $proj: sem espelho ainda ($(dirname "$vr"))"; fi
d=$(docker ps --format '{{.Names}}' 2>/dev/null | tr '\n' ' '); echo "-- docker: ${d:-nada}"
REMOTO
	exit $?
fi

if [ "$modo" = stop ]; then
	ssh "${SSHK[@]}" "$host" bash -s -- "$vr" "$PROJ" "$ckid" <<'REMOTO'
vr=$1; proj=$2; ckid=$3
systemctl stop "vmrun-$proj-$ckid-*.scope" 2>/dev/null
p=$(cat "$vr/pid" 2>/dev/null)
if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then kill -TERM -- -"$p" "$p" 2>/dev/null; sleep 2; kill -KILL -- -"$p" "$p" 2>/dev/null; echo ">> runner $p morto"; else echo ">> nenhum runner vivo"; fi
rm -f "$vr/esperando" /root/locks/prio/"$proj-$ckid".* 2>/dev/null
[ -f "$vr/rc" ] || echo 130 >"$vr/rc"
[ -f "$vr/body.sh" ] && bash "$vr/body.sh" __down 2>&1 | tail -3
REMOTO
	exit $?
fi

# ------------------------------------------------------------- acompanhar (poll)
# Cada poll e' um ssh NOVO (rc primeiro; rc presente garante log completo). Queda de conexao vira
# contagem, nunca morte da rodada. Sem VM_FOLLOW: uma linha por minuto (fila/rodando), nada mais.
acompanhar() { # <tier-nome>
	local nome=$1 ini=$SECONDS teto=$((wait_s + max_s + 600)) off=0 quedas=0 ult=-60 rc='' chunk="$root/.vm-run/.chunk.$$" est
	mkdir -p "$root/.vm-run"
	while :; do
		if [ "${VM_FOLLOW:-0}" = 1 ]; then
			if ssh_q "tail -c +$((off + 1)) '$vr/suite.log' 2>/dev/null" >"$chunk" 2>/dev/null; then
				cat "$chunk"; off=$((off + $(wc -c <"$chunk")))
			fi
		fi
		rc=$(ssh_q "cat '$vr/rc' 2>/dev/null || true" 2>/dev/null) || quedas=$((quedas + 1))   # so' ssh caido conta como queda
		[ -n "$rc" ] && break
		if [ $((SECONDS - ini)) -gt $teto ]; then echo "!! teto local (${teto}s) sem rc -- rodada pode seguir na VM: vm-run.sh attach|stop"; rc=98; break; fi
		if [ "${VM_FOLLOW:-0}" != 1 ] && [ $((SECONDS - ult)) -ge 60 ]; then
			est=$(ssh_q "[ -f '$vr/esperando' ] && echo 'na fila (prioridade)' || echo rodando" 2>/dev/null)
			echo ">> [$(((SECONDS - ini) / 60))min] $PROJ $nome: ${est:-sem contato (quedas=$quedas)}"
			ult=$SECONDS
		fi
		sleep "$poll_s"
	done
	rm -f "$chunk"
	local slug=${nome// /_}
	local log="$root/.vm-run/$PROJ-${slug//\//_}.log"
	ssh_q "cat '$vr/suite.log' 2>/dev/null" >"$log" 2>/dev/null || echo "!! nao consegui trazer o log (fica em $host:$vr/suite.log)"
	if [ "${VM_FOLLOW:-0}" != 1 ]; then echo "----- ultimas $tailn linhas ($log)"; tail -n "$tailn" "$log"; fi
	echo "== $PROJ $nome: rc=$rc ($(((SECONDS - ini) / 60))min, quedas=$quedas) -- log inteiro: ${log#"$root"/}"
	exit "$rc"
}

if [ "$modo" = attach ]; then
	acompanhar "$(ssh_q "cat '$vr/tier' 2>/dev/null" || echo '?')"
fi

# ------------------------------------------------------------------ tier / fila
case "$modo" in
all) tiers=$TIERS_ALL; fila=1 ;;
quick) tiers=quick; fila=0 ;;
sync) tiers=''; fila=0 ;;
--) [ $# -gt 0 ] || { echo "!! '--' sem comando"; exit 2; }; tiers=__cmd; fila=0 ;;
*)
	if [[ $modo =~ ^[a-z][a-z0-9_]*$ ]] && declare -F "tier_$modo" >/dev/null; then
		tiers=$modo; fila=1
		declare -F fila_tier >/dev/null && { fila_tier "$modo" "$@" || fila=0; }   # gate alvo: sem fila
	else
		echo "uso: $0 [all|<tier> [args...]|quick|status|stop|sync|attach|-- <cmd...>]"
		echo "     tiers de $conf_rel: $(declare -F | sed -n 's/^declare -f tier_//p' | tr '\n' ' ')"
		exit 2
	fi ;;
esac
case "${VM_FILA:-auto}" in 1) fila=1 ;; 0) fila=0 ;; esac
for t in $tiers; do
	[ "$t" = __cmd ] || declare -F "tier_$t" >/dev/null || { echo "!! $conf_rel nao define tier_$t"; exit 2; }
done

# ------------------------------------------------------------ quick: diff local
# So' roda o que o diff local toca -- sem fila, em segundos. Lista calculada AQUI (local), antes de
# qualquer rsync/lock: uniao de origin/main...HEAD (ou HEAD~5 sem origin/main), diff sujo e untracked.
if [ "$modo" = quick ]; then
	if git -C "$root" rev-parse --verify -q origin/main >/dev/null 2>&1; then
		base=origin/main...HEAD
	else
		base=HEAD~5
	fi
	quick_changed=()
	quick_re=${QUICK_RE:-'\.(ts|tsx|js|mjs|json|html|scss|css)$'}
	while IFS= read -r f; do
		[ -n "$f" ] || continue
		[ -f "$root/$f" ] || continue
		[[ $f =~ $quick_re ]] && quick_changed+=("$f")
	done < <(
		{
			git -C "$root" diff --name-only "$base" 2>/dev/null
			git -C "$root" diff --name-only HEAD 2>/dev/null
			git -C "$root" ls-files -o --exclude-standard
		} | sort -u
	)
	if [ ${#quick_changed[@]} -eq 0 ]; then
		echo ">> quick: nada mudou vs origin/main"
		exit 0
	fi
fi

# ------------------------------------------------------- lock local + rsync + deps
# flock LOCAL por checkout: duas sessoes desta maquina nao rsyncam por cima da rodada uma da outra.
mkdir -p "$root/.vm-run"
exec 8>"/tmp/.vmrun-$PROJ-$ckid.lock"
if ! flock -n 8; then
	echo ">> outra sessao deste checkout ja' esta' na VM -- esperando (ate ${wait_s}s)..."
	flock -w "$wait_s" 8 || { echo "!! desisti apos ${wait_s}s no lock local"; exit 75; }
fi

ex=(); for e in "${EXCLUDES[@]}"; do ex+=(--exclude "$e"); done
inc=(); for i in "${INCLUDES[@]-}"; do [ -n "$i" ] && inc+=(--include "$i"); done
hf=(); for f in "${HOME_FILES[@]-}"; do [ -n "$f" ] && [ -e "$HOME/$f" ] && hf+=("$f"); done
ssh_q "mkdir -p '$dir' '$vr' /root/locks/prio /var/tmp/$PROJ && rm -rf '$vr/home' && mkdir -p '$vr/home' &&
find /root/repos -maxdepth 1 -type d -name '$PROJ-*' ! -name '$PROJ-$ckid' -mtime +21 -exec rm -rf {} + 2>/dev/null; true" \
	|| { echo "!! sem ssh pra $host"; exit 3; }
rsync -az --delete --chown=root:root "${inc[@]}" "${ex[@]}" "$root/" "$host:$dir/" || { echo "!! rsync falhou"; exit 3; }
if [ ${#hf[@]} -gt 0 ]; then
	(cd "$HOME" && rsync -a --relative --chown=root:root "${hf[@]}" "$host:$vr/home/") || { echo "!! HOME_FILES nao viajaram"; exit 3; }
fi
homehash=$( (cd "$HOME" && cat "${hf[@]}" 2>/dev/null) </dev/null | sha256sum | cut -c1-16)
[ -n "$tiers" ] || { echo ">> espelho sincronizado: $host:$dir"; exit 0; }

lockhash=$( (cd "$root" && cat "${LOCKFILES[@]}" 2>/dev/null) | sha256sum | cut -c1-16)

# rodada anterior deste espelho ainda VIVA (lease fresco, sem rc)? nunca clobberar: attach ou stop.
viva=$(ssh_q "[ -f '$vr/rc' ] || { l=\$(stat -c %Y '$vr/lease' 2>/dev/null || echo 0); [ \$(( \$(date +%s) - l )) -le 120 ] && echo viva; }" 2>/dev/null)
[ "$viva" = viva ] && { echo "!! rodada anterior ainda viva neste espelho -- 'vm-run.sh attach' pra acompanhar ou 'vm-run.sh stop'"; exit 4; }

# ------------------------------------------------- memo: espelho IDENTICO ao ultimo VERDE nao roda
# Impressao digital do espelho (caminho+tamanho+mtime dos arquivos que o rsync leva; EXCLUDES fora)
# + o pedido (tier, cmd, lista do quick). rc=0 grava em $vr/green/<tier>; pedido igual sobre espelho
# igual devolve o verde na hora. So' o VERDE memoiza (vermelho roda sempre); VM_FORCE=1 ignora.
memokey=$modo; [ "$modo" = -- ] && memokey=cmd-$(printf '%s\n' "$@" | sha256sum | cut -c1-8)
prune=''; for e in "${EXCLUDES[@]}"; do prune="$prune -o -name '$e'"; done
fp=$(ssh_q "cd '$dir' && find . \( -false $prune \) -prune -o -type f -printf '%P %s %T@\n' | LC_ALL=C sort | sha256sum" 2>/dev/null)
fp=$(printf '%s\n%s\n%s\n%s\n' "${fp%% *}" "$*" "${quick_changed[*]-}" "$homehash" | sha256sum | cut -c1-16)
verde=$(ssh_q "[ -f '$vr/green/$memokey' ] && { cat '$vr/green/$memokey'; date -r '$vr/green/$memokey' '+%d/%m %H:%M'; }" 2>/dev/null | tr '\n' ' ')
if [ "${VM_FORCE:-0}" != 1 ] && [ "${verde%% *}" = "$fp" ]; then
	echo ">> $PROJ [$tiers] VERDE memoizado: espelho identico ao ultimo verde (${verde#* }) -- VM_FORCE=1 pra rodar de novo"
	exit 0
fi

# ------------------------------------------------- runner destacado + corpo (escritos aqui, rsync)
runid="$(date +%s).$$"
tmp=$(mktemp -d "$root/.vm-run/.gen.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
{ [ $# -gt 0 ] && printf '%q ' "$@"; echo; } >"$tmp/cmd"   # sem argumento = linha vazia, nunca ''
printf '%s\n' "$runid" >"$tmp/id"
printf '%s\n' "$fp" >"$tmp/fp"
printf '%s\n' "${modo}${*:+ $*}" >"$tmp/tier"
[ "$modo" = quick ] && printf '%s\n' "${quick_changed[@]}" >"$tmp/changed.txt"

cat >"$tmp/body.sh" <<EOB
#!/usr/bin/env bash
# corpo da rodada, DENTRO do scope de memoria -- escrito por vm-run.sh (runid $runid)
set -u
cd '$dir' || exit 1
. '$dir/$conf_rel'
export TMPDIR=/var/tmp/$PROJ CI=1 NG_CLI_ANALYTICS=false PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright VM_CHANGED=$vr/changed.txt VM_HOME=$vr/home
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=${VM_NODE_MB:-4096}}"
mkdir -p "\$TMPDIR"
case "\${1:-}" in
__deps) deps ;;
__down) declare -F servicos_down >/dev/null && servicos_down ;;
__cmd) ! declare -F ambiente >/dev/null || ambiente || exit \$?
   eval "\$(cat '$vr/cmd')" ;;
*) tl=\$1; eval "set -- \$(cat '$vr/cmd')"   # argumentos do pedido (gate regras,docs) chegam ao tier
   for t in \$tl; do echo ">> tier \$t\${*:+ \$*}"; tier_\$t "\$@" || exit \$?; done ;;
esac
EOB

cat >"$tmp/run.sh" <<EOR
#!/usr/bin/env bash
# runner destacado escrito por vm-run.sh (runid $runid) -- contrato no cabecalho de la'.
set -u
echo \$\$ >'$vr/pid'
tk=/root/locks/prio/$PROJ-$ckid.\$\$
trap "rm -f '$vr/esperando' \$tk; [ -f '$vr/rc' ] || echo 97 >'$vr/rc'" EXIT
( cd /; while kill -0 \$\$ 2>/dev/null; do touch '$vr/lease'; [ -f '$vr/esperando' ] && touch "\$tk"; sleep $poll_s; done ) &
if [ $fila = 1 ]; then
  exec 9>/root/locks/offline-suite.lock
  if ! flock -n 9; then
    echo ">> fila da VM ocupada -- ticket de prioridade ($PROJ) na mesa, aguardando vaga..."
    : >'$vr/esperando'; touch "\$tk"
    flock -w $wait_s 9 || { echo '!! desisti apos ${wait_s}s na fila'; echo 75 >'$vr/rc'; exit 75; }
    rm -f '$vr/esperando' "\$tk"
    echo ">> vaga liberada: rodando"
  fi
fi
if [ '$host' != tibiatest ]; then
  # host do POOL != tibiatest: nao mexe no scope da rodada, protege o RESTO da caixa (pode ter prod
  # do dono do lado, ex. tikagenda) com um slice PROPRIO -- CPUWeight/IOWeight baixos + teto de RAM em
  # 70% do MemTotal daquele host. Idempotente: so' escreve+recarrega se o conteudo mudou.
  mt=\$(awk '/MemTotal/{print \$2}' /proc/meminfo); mm=\$(( mt * 70 / 100 ))
  want=\$'[Slice]\nCPUWeight=50\nIOWeight=50\nMemoryMax='"\${mm}"'K\n'
  cur=\$(cat /etc/systemd/system/teste.slice 2>/dev/null || true)
  [ "\$cur" = "\$want" ] || { printf '%s' "\$want" >/etc/systemd/system/teste.slice && systemctl daemon-reload; }
  scope() { systemd-run --scope -q --unit="vmrun-$PROJ-$ckid-\$\$-\$RANDOM" --slice=teste.slice -p TasksMax=8192 -- nice -n 5 timeout -k 30 $max_s bash '$vr/body.sh' "\$1"; }
else
  scope() { systemd-run --scope -q --unit="vmrun-$PROJ-$ckid-\$\$-\$RANDOM" -p MemoryHigh=$memhigh -p MemoryMax=$mem -p MemorySwapMax=$swapmax -p TasksMax=8192 -- nice -n 5 timeout -k 30 $max_s bash '$vr/body.sh' "\$1"; }
fi
if [ "\$(cat '$vr/deps.sha' 2>/dev/null)" != '$lockhash' ]; then
  echo ">> deps: lockfile novo ou espelho novo -- instalando (uma vez por lockfile)"
  scope __deps && echo '$lockhash' >'$vr/deps.sha' || { echo '!! deps falharam'; echo 96 >'$vr/rc'; exit 96; }
fi
echo ">> $PROJ [$tiers] em $dir (VM inteira: high $memhigh / max $mem / swap $swapmax, teto ${max_s}s)"
scope '$tiers'
rc=\$?
[ \$rc -eq 124 ] && echo "!! TIMEOUT: passou do teto VM_RUN_MAX_S=${max_s}s e foi morta"
[ \$rc -eq 137 ] && echo "!! morta por sinal (estourou MemoryMax=$mem + swap $swapmax, ou vm-run.sh stop)"
[ \$rc -eq 0 ] && mkdir -p '$vr/green' && cp '$vr/fp' '$vr/green/$memokey'
rm -rf "/var/tmp/$PROJ"/* 2>/dev/null   # higiene: tmp/pytest da rodada fora; mirror+.venv+node_modules ficam (a esquenta)
echo \$rc >'$vr/rc.tmp' && mv '$vr/rc.tmp' '$vr/rc'
EOR

ssh_q "rm -f '$vr/rc' '$vr/rc.tmp' '$vr/suite.log' '$vr/lease' '$vr/esperando' '$vr/pid'" || { echo "!! nao consegui preparar $vr"; exit 3; }
rsync -a "$tmp/" "$host:$vr/" || { echo "!! nao consegui escrever o runner na VM"; exit 3; }
# Lancamento com confirmacao: sem o token RUN-<pid>, nada foi destacado -- abortar AQUI e' o que
# impede o poll de pendurar esperando um rc que nunca vai existir.
tok=$(ssh_q "setsid bash '$vr/run.sh' >'$vr/suite.log' 2>&1 </dev/null & echo RUN-\$!")
case "$tok" in
*RUN-[0-9]*) ;;
*) echo "!! lancamento sem confirmacao (resposta: '${tok:-vazia}')"; exit 3 ;;
esac
echo ">> $PROJ [$tiers] destacado na VM (runid $runid, fila=$fila) -- log: $host:$vr/suite.log"
acompanhar "${modo}${*:+ ${*}}"
