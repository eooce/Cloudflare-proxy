// 相关环境变量(都是可选的, 可以都不填)
// SUB_PATH | subpath  订阅token
// UUID     |    节点UU-ID
// DISABLE_TROJAN | 是否关闭tro-jan协议, 设置为true时关闭，false开启，默认开启 
// DISABLE_ECH | disable_ech  是否在订阅中关闭ECH, 设置为true时关闭，false开启，默认开启
// ECH | ech  自定义ECH配置来源, 格式: 配置域名+DoH服务器, 默认使用 cloudflare-ech.com+https://dns.alidns.com/dns-query

let connect = (await import(atob('Y2xvdWRmbGFyZTpzb2NrZXRz'))).connect;

let password = '123456';  // 主页登录密码,建议修改或添加 PASSWORD环境变量
let relayIP = 'ProxyIP.CMLiussss.net';  // pro-xyip，格式：ip、域名、ip:port、域名:port等,没填写port，默认使用443
let mainID = 'f0ebd662-288e-42cd-b679-87c4b4f587e4'; // 节点UU-ID和TG代理的secret,建议修改或添加环境变量
let subPath = 'link';     // 订阅token,不修改将使用通行UU-ID作为订阅路径
let disabletro = false;  // 是否关闭tro-jan协议, 设置为true时关闭，false开启，默认开启 
let disableech = true;  // 是否关闭ECH, 设置为true时关闭，false开启，默认关闭

// CDN 
let cfip = [ // 格式:优选域名:端口#备注名称、优选IP:端口#备注名称、[ipv6优选]:端口#备注名称、优选域名#备注 
    'mfa.gov.ua#SG', 'saas.sin.fan#HK', 'store.ubi.com#SG','openai.com#JP','cf.0sm.com#US', 
    'www.shopify.com#KR', 'cf.877774.xyz#HK','cdns.doon.eu.org#JP','cdn.664667.xyz#TW','www.nexusmods.com#HK'
];  // 在此感谢各位大佬维护的优选域名

const S5 = 's' + 'ocks5';
const VLS = 'v' + 'l' + 'e' + 's' + 's';
const TRO = 't' + 'r' + 'o' + 'j' + 'a' + 'n';
const CFG = { dnPack: 32 * 1024, upPack: 20 * 1024, dnMs: 1 };
const txt = new TextEncoder();
const dec = new TextDecoder();
const nil = new Uint8Array(0);
const badHead = new Set(['HEAD', 'POST', 'GET ', 'OPTI']);
const CRYPTO = globalThis.crypto;
const macKeys = new Map();
const leases = new Map();

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
function closeSocketQuietly(socket) { 
    try { 
        if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
            socket.close(); 
        }
    } catch (error) {} 
}

function formatIdentifier(arr, offset = 0) {
    const hex = [...arr.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
}

function base64ToArray(b64Str) {
    if (!b64Str) return { error: null };
    try { 
        const binaryString = atob(b64Str.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return { earlyData: bytes.buffer, error: null }; 
    } catch (error) { 
        return { error }; 
    }
}

function parsePryAddress(serverStr) {
    if (!serverStr) return null;
    serverStr = serverStr.trim();
    // 解析 S5
    if (serverStr.startsWith('s' + 'ocks://') || serverStr.startsWith(S5 + '://')) {
        const urlStr = serverStr.startsWith(S5 + '://') ? serverStr : (S5 + '://') + serverStr.slice(8);
        try {
            const url = new URL(urlStr);
            return {
                type: S5,
                host: url.hostname,
                port: parseInt(url.port) || 1080,
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }
    
    // 解析 HTTP
    if (serverStr.startsWith('http://') || serverStr.startsWith('https://')) {
        try {
            const url = new URL(serverStr);
            return {
                type: 'http',
                host: url.hostname,
                port: parseInt(url.port) || (serverStr.startsWith('https://') ? 443 : 80),
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }
    
    // 处理 IPv6 格式 [host]:port
    if (serverStr.startsWith('[')) {
        const closeBracket = serverStr.indexOf(']');
        if (closeBracket > 0) {
            const host = serverStr.substring(1, closeBracket);
            const rest = serverStr.substring(closeBracket + 1);
            if (rest.startsWith(':')) {
                const port = parseInt(rest.substring(1), 10);
                if (!isNaN(port) && port > 0 && port <= 65535) {
                    return { type: 'direct', host, port };
                }
            }
            return { type: 'direct', host, port: 443 };
        }
    }

    const lastColonIndex = serverStr.lastIndexOf(':');
    
    if (lastColonIndex > 0) {
        const host = serverStr.substring(0, lastColonIndex);
        const portStr = serverStr.substring(lastColonIndex + 1);
        const port = parseInt(portStr, 10);
        
        if (!isNaN(port) && port > 0 && port <= 65535) {
            return { type: 'direct', host, port };
        }
    }
    
    return { type: 'direct', host: serverStr, port: 443 };
}

function isSpeedTestSite(hostname) {
    const speedTestDomains = ['speedtest.net','fast.com','speedtest.cn','speed.cloudflare.com', 'ovo.speedtestcustom.com'];
    if (speedTestDomains.includes(hostname)) {
        return true;
    }

    for (const domain of speedTestDomains) {
        if (hostname.endsWith('.' + domain) || hostname === domain) {
            return true;
        }
    }
    return false;
}

async function sha224(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let H = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen, false);
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    const W = new Uint32Array(64);
    
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(chunk + i * 4, false);
    }
    
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(W[i - 15], 7) ^ rightRotate(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rightRotate(W[i - 2], 17) ^ rightRotate(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    
    let [a, b, c, d, e, f, g, h] = H;
    
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  
  const result = [];
  for (let i = 0; i < 7; i++) {
    result.push(
      ((H[i] >>> 24) & 0xff).toString(16).padStart(2, '0'),
      ((H[i] >>> 16) & 0xff).toString(16).padStart(2, '0'),
      ((H[i] >>> 8) & 0xff).toString(16).padStart(2, '0'),
      (H[i] & 0xff).toString(16).padStart(2, '0')
    );
  }
  return result.join('');
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

export default {
	/**
	 * @param {import("@cloudflare/workers-types").Request} request
		 * @param {{UUID: string, uuid: string, PASSWORD: string, PASSWD: string, password: string, SUB_PATH: string, subpath: string, DISABLE_ALT: string, SECRET: string}} env
	 * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
    async fetch(request, env, ctx) {
        try {

			if (subPath === 'link' || subPath === '') {
				subPath = mainID;
			}

            const envRelay = env['PR' + 'OXYIP'] || env['pr' + 'oxyip'] || env['pr' + 'oxyIP'];
            if (envRelay) {
                const servers = envRelay.split(',').map(s => s.trim());
                relayIP = servers[0]; 
            }
            password = env.PASSWORD || env.PASSWD || env.password || password;
            subPath = env.SUB_PATH || env.subpath || subPath;
            mainID = env['U' + 'UID'] || env['u' + 'uid'] || mainID;
            disabletro = env['DIS' + 'ABLE_TRO' + 'JAN'] || env['CLOSE_TRO' + 'JAN'] || disabletro;
            disableech = env['DISABLE_E' + 'CH'] || env['disable_e' + 'ch'] || disableech;
            
            const url = new URL(request.url);
            const pathname = url.pathname;
            
            let pathRelayIP = null;
            if (pathname.startsWith('/pr'+'oxyip=')) {
                try {
                    pathRelayIP = decodeURIComponent(pathname.substring(9)).trim();
                } catch (e) {
                    // 忽略错误
                }

                if (pathRelayIP && !request.headers.get('Upgrade')) {
                    relayIP = pathRelayIP;
                    return new Response(`set relayIP to: ${relayIP}\n\n`, {
                        headers: { 
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }

            // ==================== TG 代理路由 ====================
            if (pathname === '/health') {
                return new Response('{"ok":true}', { headers: { 'content-type': 'application/json; charset=utf-8' } });
            }
            if (pathname === '/api/v1/session') {
                return await sessApi(request, env);
            }
            if (pathname === '/api/v1/ws') {
                return await laneApi(request, env, url);
            }

            if (request.headers.get('Upgrade') === 'websocket') {
                let wsPathRelayIP = null;
                if (pathname.startsWith('/pr'+'oxyip=')) {
                    try {
                        wsPathRelayIP = decodeURIComponent(pathname.substring(9)).trim();
                    } catch (e) {
                        // 忽略错误
                    }
                }
                
                const customRelayIP = wsPathRelayIP || url.searchParams.get('pr'+'oxyip') || request.headers.get('pr'+'oxyip');
                return await handleVlsRequest(request, customRelayIP);
            } else if (request.method === 'GET') {
                if (url.pathname === '/') {
                    // TG桌面客户端内置代理页(仅当 ?bridge= 携带有效签名时返回)
                    const gateResp = await gatePage(request, env, url);
                    if (gateResp) return gateResp;
                    return getHomePage(request, env);
                }
                
                if (url.pathname.toLowerCase().includes(`/${subPath.toLowerCase()}`)) {
                    const currentDomain = url.hostname;
                    const vlsHeader = VLS;
                    const troHeader = TRO;
                    // ECH 配置来源: 读取 ECH/ech 环境变量,未填写时自动使用默认值(cloudflare-ech.com + 阿里DoH)
                    const echVal = (env['ECH'] || env['ech'] || '').trim() || 'cloudflare-ech.com+https://dns.alidns.com/dns-query';
                    const echParam = disableech ? '' : `&ech=${echVal}`;
                    
                    // 生成 VLE-SS 节点
                    const vlsLinks = cfip.map(cdnItem => {
                        let host, port = 443, nodeName = '';
                        if (cdnItem.includes('#')) {
                            const parts = cdnItem.split('#');
                            cdnItem = parts[0];
                            nodeName = parts[1];
                        }

                        if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                            const ipv6End = cdnItem.indexOf(']:');
                            host = cdnItem.substring(0, ipv6End + 1); 
                            const portStr = cdnItem.substring(ipv6End + 2); 
                            port = parseInt(portStr) || 443;
                        } else if (cdnItem.includes(':')) {
                            const parts = cdnItem.split(':');
                            host = parts[0];
                            port = parseInt(parts[1]) || 443;
                        } else {
                            host = cdnItem;
                        }
                        
                        const vlsNodeName = nodeName ? `${nodeName}-${vlsHeader}` : `Workers-${vlsHeader}`;
                        return `${vlsHeader}://${mainID}@${host}:${port}?encryption=none&security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=%2F%3Fed%3D2560${echParam}#${vlsNodeName}`;
                    });
                    
                    // 生成 Tro-jan 节点
                    let allLinks = [...vlsLinks];
                    if (!disabletro) {
                        const troLinks = cfip.map(cdnItem => {
                            let host, port = 443, nodeName = '';
                            if (cdnItem.includes('#')) {
                                const parts = cdnItem.split('#');
                                cdnItem = parts[0];
                                nodeName = parts[1];
                            }

                            if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                                const ipv6End = cdnItem.indexOf(']:');
                                host = cdnItem.substring(0, ipv6End + 1); 
                                const portStr = cdnItem.substring(ipv6End + 2); 
                                port = parseInt(portStr) || 443;
                            } else if (cdnItem.includes(':')) {
                                const parts = cdnItem.split(':');
                                host = parts[0];
                                port = parseInt(parts[1]) || 443;
                            } else {
                                host = cdnItem;
                            }
                            
                            const troNodeName = nodeName ? `${nodeName}-${troHeader}` : `Workers-${troHeader}`;
                            return `${troHeader}://${mainID}@${host}:${port}?security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=%2F%3Fed%3D2560${echParam}#${troNodeName}`;
                        });
                        allLinks = [...vlsLinks, ...troLinks];
                    }
                    const linksText = allLinks.join('\n');
                    const base64Content = btoa(unescape(encodeURIComponent(linksText)));
                    return new Response(base64Content, {
                        headers: { 
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }
            return new Response('Not Found', { status: 404 });
        } catch (err) {
            return new Response('Internal Server Error', { status: 500 });
        }
    },
};

/**
 * 
 * @param {import("@cloudflare/workers-types").Request} request
 */
async function handleVlsRequest(request, customRelayIP) {
    const wssPair = new WebSocketPair();
    const clientSock = wssPair[0];
    const serverSock = wssPair[1];
    serverSock.accept();
    serverSock.binaryType = 'arraybuffer';
    let remoteConnWrapper = { socket: null };
    let isDnsQuery = false;
    let isTro = false;
    const earlyData = request.headers.get('sec-websocket-protocol') || '';
    const readable = makeReadableStr(serverSock, earlyData);

    readable.pipeTo(new WritableStream({
        async write(chunk) {
            if (isDnsQuery) return await forwardataudp(chunk, serverSock, null);
            if (remoteConnWrapper.socket) {
                const writer = remoteConnWrapper.socket.writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }
            
            if (!disabletro) {
                const troResult = await parsetroHeader(chunk, mainID);
                if (!troResult.hasError) {
                    isTro = true;
                    const { addressType, port, hostname, rawClientData } = troResult;
                    
                    if (isSpeedTestSite(hostname)) {
                        throw new Error('Speedtest site is blocked');
                    }
                    
                    await forwardataTCP(hostname, port, rawClientData, serverSock, null, remoteConnWrapper, customRelayIP);
                    return;
                }
            }
            
            const { hasError, message, addressType, port, hostname, rawIndex, version, isUDP } = parseVLsPacketHeader(chunk, mainID);
            if (hasError) throw new Error(message);

            if (isSpeedTestSite(hostname)) {
                throw new Error('Speedtest site is blocked');
            }

            if (isUDP) {
                if (port === 53) isDnsQuery = true;
                else throw new Error('UDP is not supported');
            }
            const respHeader = new Uint8Array([version[0], 0]);
            const rawData = chunk.slice(rawIndex);
            if (isDnsQuery) return forwardataudp(rawData, serverSock, respHeader);
            await forwardataTCP(hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, customRelayIP);
        },
    })).catch((err) => {
        // console.error('Readable pipe error:', err);
    });

    return new Response(null, { status: 101, webSocket: clientSock });
}

async function parsetroHeader(buffer, passwordPlainText) {
  const sha224Password = await sha224(passwordPlainText);
  
  if (buffer.byteLength < 56) {
    return { hasError: true, message: "invalid data" };
  }
  let crLfIndex = 56;
  if (new Uint8Array(buffer.slice(56, 57))[0] !== 0x0d || new Uint8Array(buffer.slice(57, 58))[0] !== 0x0a) {
    return { hasError: true, message: "invalid header format" };
  }
  const password = new TextDecoder().decode(buffer.slice(0, crLfIndex));
  if (password !== sha224Password) {
    return { hasError: true, message: "invalid password" };
  }

  const s5DataBuffer = buffer.slice(crLfIndex + 2);
  if (s5DataBuffer.byteLength < 6) {
    return { hasError: true, message: "invalid S5 request data" };
  }

  const view = new DataView(s5DataBuffer);
  const cmd = view.getUint8(0);
  if (cmd !== 1) {
    return { hasError: true, message: "unsupported command, only TCP is allowed" };
  }

  const atype = view.getUint8(1);
  let addressLength = 0;
  let addressIndex = 2;
  let address = "";
  switch (atype) {
    case 1: // IPv4
      addressLength = 4;
      address = new Uint8Array(s5DataBuffer.slice(addressIndex, addressIndex + addressLength)).join(".");
      break;
    case 3: // Domain
      addressLength = new Uint8Array(s5DataBuffer.slice(addressIndex, addressIndex + 1))[0];
      addressIndex += 1;
      address = new TextDecoder().decode(s5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      break;
    case 4: // IPv6
      addressLength = 16;
      const dataView = new DataView(s5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      address = ipv6.join(":");
      break;
    default:
      return { hasError: true, message: `invalid addressType is ${atype}` };
  }

  if (!address) {
    return { hasError: true, message: `address is empty, addressType is ${atype}` };
  }

  const portIndex = addressIndex + addressLength;
  const portBuffer = s5DataBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  return {
    hasError: false,
    addressType: atype,
    port: portRemote,
    hostname: address,
    rawClientData: s5DataBuffer.slice(portIndex + 4)
  };
}

async function connect2S5(relayConf, targetHost, targetPort, initialData) {
    const { host, port, username, password } = relayConf;
    const socket = connect({ hostname: host, port: port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    
    try {
        const authMethods = username && password ? 
            new Uint8Array([0x05, 0x02, 0x00, 0x02]) :
            new Uint8Array([0x05, 0x01, 0x00]); 
        
        await writer.write(authMethods);
        const methodResponse = await reader.read();
        if (methodResponse.done || methodResponse.value.byteLength < 2) {
            throw new Error('S5 method selection failed');
        }
        
        const selectedMethod = new Uint8Array(methodResponse.value)[1];
        if (selectedMethod === 0x02) {
            if (!username || !password) {
                throw new Error('S5 requires authentication');
            }
            const userBytes = new TextEncoder().encode(username);
            const passBytes = new TextEncoder().encode(password);
            const authPacket = new Uint8Array(3 + userBytes.length + passBytes.length);
            authPacket[0] = 0x01; 
            authPacket[1] = userBytes.length;
            authPacket.set(userBytes, 2);
            authPacket[2 + userBytes.length] = passBytes.length;
            authPacket.set(passBytes, 3 + userBytes.length);
            await writer.write(authPacket);
            const authResponse = await reader.read();
            if (authResponse.done || new Uint8Array(authResponse.value)[1] !== 0x00) {
                throw new Error('S5 authentication failed');
            }
        } else if (selectedMethod !== 0x00) {
            throw new Error(`S5 unsupported auth method: ${selectedMethod}`);
        }
        
        const hostBytes = new TextEncoder().encode(targetHost);
        const connectPacket = new Uint8Array(7 + hostBytes.length);
        connectPacket[0] = 0x05;
        connectPacket[1] = 0x01;
        connectPacket[2] = 0x00; 
        connectPacket[3] = 0x03; 
        connectPacket[4] = hostBytes.length;
        connectPacket.set(hostBytes, 5);
        new DataView(connectPacket.buffer).setUint16(5 + hostBytes.length, targetPort, false);
        await writer.write(connectPacket);
        const connectResponse = await reader.read();
        if (connectResponse.done || new Uint8Array(connectResponse.value)[1] !== 0x00) {
            throw new Error('S5 connection failed');
        }
        
        await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        return socket;
    } catch (error) {
        writer.releaseLock();
        reader.releaseLock();
        throw error;
    }
}

async function connect2Http(relayConf, targetHost, targetPort, initialData) {
    const { host, port, username, password } = relayConf;
    const socket = connect({ hostname: host, port: port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    try {
        let connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`;
        connectRequest += `Host: ${targetHost}:${targetPort}\r\n`;
        
        if (username && password) {
            const auth = btoa(`${username}:${password}`);
            connectRequest += `${'Pr'+'oxy-Authorization'}: Basic ${auth}\r\n`;
        }
        
        connectRequest += `User-Agent: Mozilla/5.0\r\n`;
        connectRequest += `Connection: keep-alive\r\n`;
        connectRequest += '\r\n';
        await writer.write(new TextEncoder().encode(connectRequest));
        let responseBuffer = new Uint8Array(0);
        let headerEndIndex = -1;
        let bytesRead = 0;
        const maxHeaderSize = 8192;
        
        while (headerEndIndex === -1 && bytesRead < maxHeaderSize) {
            const { done, value } = await reader.read();
            if (done) {
                throw new Error('Connection closed before receiving HTTP response');
            }
            const newBuffer = new Uint8Array(responseBuffer.length + value.length);
            newBuffer.set(responseBuffer);
            newBuffer.set(value, responseBuffer.length);
            responseBuffer = newBuffer;
            bytesRead = responseBuffer.length;
            
            for (let i = 0; i < responseBuffer.length - 3; i++) {
                if (responseBuffer[i] === 0x0d && responseBuffer[i + 1] === 0x0a &&
                    responseBuffer[i + 2] === 0x0d && responseBuffer[i + 3] === 0x0a) {
                    headerEndIndex = i + 4;
                    break;
                }
            }
        }
        
        if (headerEndIndex === -1) {
            throw new Error('Invalid HTTP response');
        }
        
        const headerText = new TextDecoder().decode(responseBuffer.slice(0, headerEndIndex));
        const statusLine = headerText.split('\r\n')[0];
        const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
        
        if (!statusMatch) {
            throw new Error(`Invalid response: ${statusLine}`);
        }
        
        const statusCode = parseInt(statusMatch[1]);
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`Connection failed: ${statusLine}`);
        }
        
        console.log('HTTP relay connected');
        
        await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        
        return socket;
    } catch (error) {
        try { 
            writer.releaseLock(); 
        } catch (e) {}
        try { 
            reader.releaseLock(); 
        } catch (e) {}
        try { 
            socket.close(); 
        } catch (e) {}
        throw error;
    }
}

async function forwardataTCP(host, portNum, rawData, ws, respHeader, remoteConnWrapper, customRelayIP) {
    async function connectDirect(address, port, data) {
        const remoteSock = connect({ hostname: address, port: port });
        const writer = remoteSock.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
        return remoteSock;
    }
    
    let relayConf = null;
    let useRelay = false;
    if (customRelayIP) {
        relayConf = parsePryAddress(customRelayIP);
        if (relayConf && (relayConf.type === S5 || relayConf.type === 'http' || relayConf.type === 'https')) {
            useRelay = true;
        } else if (!relayConf) {
            relayConf = parsePryAddress(relayIP) || { type: 'direct', host: relayIP, port: 443 };
        }
    } else {
        relayConf = parsePryAddress(relayIP) || { type: 'direct', host: relayIP, port: 443 };
        if (relayConf.type === S5 || relayConf.type === 'http' || relayConf.type === 'https') {
            useRelay = true;
        }
    }
    
    async function connecttoPry() {
        let newSocket;
        if (relayConf.type === S5) {
            newSocket = await connect2S5(relayConf, host, portNum, rawData);
        } else if (relayConf.type === 'http' || relayConf.type === 'https') {
            newSocket = await connect2Http(relayConf, host, portNum, rawData);
        } else {
            newSocket = await connectDirect(relayConf.host, relayConf.port, rawData);
        }
        
        remoteConnWrapper.socket = newSocket;
        newSocket.closed.catch(() => {}).finally(() => closeSocketQuietly(ws));
        connectStreams(newSocket, ws, respHeader, null);
    }
    
    if (useRelay) {
        try {
            await connecttoPry();
        } catch (err) {
            throw err;
        }
    } else {
        try {
            const initialSocket = await connectDirect(host, portNum, rawData);
            remoteConnWrapper.socket = initialSocket;
            connectStreams(initialSocket, ws, respHeader, connecttoPry);
        } catch (err) {
            await connecttoPry();
        }
    }
}

function parseVLsPacketHeader(chunk, token) {
    if (chunk.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const version = new Uint8Array(chunk.slice(0, 1));
    if (formatIdentifier(new Uint8Array(chunk.slice(1, 17))) !== token) return { hasError: true, message: 'Invalid token' };
    const optLen = new Uint8Array(chunk.slice(17, 18))[0];
    const cmd = new Uint8Array(chunk.slice(18 + optLen, 19 + optLen))[0];
    let isUDP = false;
    if (cmd === 1) {} else if (cmd === 2) { isUDP = true; } else { return { hasError: true, message: 'Invalid command' }; }
    const portIdx = 19 + optLen;
    const port = new DataView(chunk.slice(portIdx, portIdx + 2)).getUint16(0);
    let addrIdx = portIdx + 2, addrLen = 0, addrValIdx = addrIdx + 1, hostname = '';
    const addressType = new Uint8Array(chunk.slice(addrIdx, addrValIdx))[0];
    switch (addressType) {
        case 1: 
            addrLen = 4; 
            hostname = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + addrLen)).join('.'); 
            break;
        case 2: 
            addrLen = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + 1))[0]; 
            addrValIdx += 1; 
            hostname = new TextDecoder().decode(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
            break;
        case 3: 
            addrLen = 16; 
            const ipv6 = []; 
            const ipv6View = new DataView(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
            for (let i = 0; i < 8; i++) ipv6.push(ipv6View.getUint16(i * 2).toString(16)); 
            hostname = ipv6.join(':'); 
            break;
        default: 
            return { hasError: true, message: `Invalid address type: ${addressType}` };
    }
    if (!hostname) return { hasError: true, message: `Invalid address: ${addressType}` };
    return { hasError: false, addressType, port, hostname, isUDP, rawIndex: addrValIdx + addrLen, version };
}

function makeReadableStr(socket, earlyDataHeader) {
    let cancelled = false;
    return new ReadableStream({
        start(controller) {
            socket.addEventListener('message', async (event) => {
                if (cancelled) return;
                let data = event.data;
                if (data instanceof Blob) {
                    data = await data.arrayBuffer();
                }
                controller.enqueue(data);
            });
            socket.addEventListener('close', () => { 
                if (!cancelled) { 
                    closeSocketQuietly(socket); 
                    controller.close(); 
                } 
            });
            socket.addEventListener('error', (err) => controller.error(err));
            const { earlyData, error } = base64ToArray(earlyDataHeader);
            if (error) {
                Promise.resolve().then(() => controller.error(error));
            } else if (earlyData) {
                Promise.resolve().then(() => {
                    if (!cancelled) controller.enqueue(earlyData);
                });
            }
        },
        cancel() { 
            cancelled = true; 
            closeSocketQuietly(socket); 
        }
    });
}

async function connectStreams(remoteSocket, webSocket, headerData, retryFunc) {
    let header = headerData, hasData = false;
    await remoteSocket.readable.pipeTo(
        new WritableStream({
            async write(chunk) {
                hasData = true;
                if (webSocket.readyState !== WS_READY_STATE_OPEN) {
                    throw new Error('ws.readyState is not open');
                }
                if (header) { 
                    const response = new Uint8Array(header.length + chunk.byteLength);
                    response.set(header, 0);
                    response.set(chunk, header.length);
                    webSocket.send(response.buffer); 
                    header = null; 
                } else { 
                    webSocket.send(chunk); 
                }
            },
            abort() {},
        })
    ).catch((err) => { 
        closeSocketQuietly(webSocket); 
    });
    if (!hasData && retryFunc) {
        await retryFunc();
    }
}

async function forwardataudp(udpChunk, webSocket, respHeader) {
    try {
        const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
        let vlHeader = respHeader;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();
        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === WS_READY_STATE_OPEN) {
                    if (vlHeader) { 
                        const response = new Uint8Array(vlHeader.length + chunk.byteLength);
                        response.set(vlHeader, 0);
                        response.set(chunk, vlHeader.length);
                        webSocket.send(response.buffer);
                        vlHeader = null; 
                    } else { 
                        webSocket.send(chunk); 
                    }
                }
            },
        }));
    } catch (error) {
        // console.error('UDP forward error:', error);
    }
}

// ==================== TG 代理基础工具 ====================
const reply = (body = null, status = 404) => new Response(body, { status });

/** 统一转成 Uint8Array 视图；不复制 */
function u8(v) {
  if (v instanceof Uint8Array && v.constructor === Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  throw TypeError();
}

const dup = (v) => u8(v).slice();

function cat(...args) {
  const parts = args.filter((v) => v?.byteLength).map(u8);
  const out = new Uint8Array(parts.reduce((t, p) => t + p.byteLength, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

const hex = (v) =>
  Uint8Array.from({ length: v.length / 2 }, (_, i) => Number.parseInt(v.slice(i * 2, i * 2 + 2), 16));

const b64 = (v) => {
  const b = v instanceof Uint8Array ? v : new Uint8Array(v);
  return btoa(String.fromCharCode(...b)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const un64 = (v) => {
  const s = v.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

const rand = (n) => CRYPTO.getRandomValues(new Uint8Array(n));

/** 唤醒等待中的窗口授权（emitDn 用） */
const wake = (st) => { const ok = st.wake; st.wake = null; ok?.(); };

const isType = (t) => t === 1 || t === 2 || t === 3 || t === 4 || t === 17;

// ==================== 帧编解码 ====================
/** type|sid(3B)|len(4B)|payload */
function encFrame(type, sid, data = nil) {
  const body = u8(data);
  if (!isType(type)) throw RangeError();
  if (!Number.isInteger(sid) || sid < 0 || sid > 0xffffff) throw RangeError();
  if (body.byteLength > 1024 * 1024) throw RangeError();
  const frame = new Uint8Array(8 + body.byteLength);
  frame[0] = type;
  frame[1] = sid >>> 16;
  frame[2] = sid >>> 8;
  frame[3] = sid;
  new DataView(frame.buffer).setUint32(4, body.byteLength, false);
  frame.set(body, 8);
  return frame;
}

function readFrame(b, o) {
  if (b.byteLength - o < 8) return null;
  const type = b[o];
  if (!isType(type)) throw Error();
  const view = new DataView(b.buffer, b.byteOffset + o, b.byteLength - o);
  const sid = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
  const n = view.getUint32(4, false);
  if (n > 1024 * 1024) throw Error();
  const total = 8 + n;
  if (b.byteLength - o < total) return null;
  return {
    frame: { type, sid, payload: b.subarray(o + 8, o + total) },
    consumed: total,
  };
}

function splitFrames(v) {
  const src = u8(v), out = [];
  for (let o = 0; o < src.byteLength;) {
    const part = readFrame(src, o);
    if (!part) throw Error();
    if (out.length >= 4096) throw Error();
    out.push(part.frame);
    o += part.consumed;
  }
  return out;
}

/** type=4 的 payload 是 4 字节窗口增量 */
function winDelta(data) {
  const body = u8(data);
  if (body.byteLength !== 4) throw Error();
  const n = new DataView(body.buffer, body.byteOffset, 4).getUint32(0, false);
  if (!n) throw Error();
  return n;
}

/** 校验单帧的 payload 形态，并返回窗口增量 */
function checkFrame(frame) {
  const { type, payload: data } = frame;
  if (type === 1 || type === 3) { if (data.byteLength) throw Error(); return 0; }
  if (type === 2) { if (!data.byteLength) throw Error(); return 0; }
  if (type === 4) return winDelta(data);
  throw Error();
}

// ==================== TG 传输头 ====================
const i16 = (b, o) => (b[o] | (b[o + 1] << 8)) << 16 >> 16;

/** 解密后的 64 字节头 → { mode, dc, media } */
function parseHead(head) {
  const tag = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(56, true);
  const mode = tag === 0xefefefef ? 0xef : tag === 0xeeeeeeee ? 0xee : tag === 0xdddddddd ? 0xdd : 0;
  if (!mode) throw Error();
  const dc = i16(head, 60);
  const target = Math.abs(dc) - 1;
  if (target < 0 || target >= 5) throw Error();
  return { mode, target, media: dc < 0 };
}

/** 构造发给 TG 服务端的 64 字节假头：随机填充 + 56..60 填 mode + 60..62 填 dc */
function makeHead(mode, target, media) {
  const head = new Uint8Array(64);
  do {
    CRYPTO.getRandomValues(head);
  } while (
    head[0] === 0xef ||
    badHead.has(dec.decode(head.subarray(0, 4))) ||
    head.subarray(4, 8).every((v) => v === 0)
  );
  head.fill(mode, 56, 60);
  new DataView(head.buffer).setInt16(60, (target + 1) * (media ? -1 : 1), true);
  return head;
}

// ==================== 密钥 / 主机 ====================
/** SECRET → AES-CTR 密钥；dd 前缀保留完整 34 hex，其余取末 32 hex */
function keyFrom(v, keepTag = false) {
  const str = String(v || '').trim().toLowerCase();
  if (!/^(?:[0-9a-f]{32}|(?:dd|ee|ef)[0-9a-f]{32})$/.test(str)) throw Error();
  return hex(keepTag && str.length === 34 && str.startsWith('dd') ? str : str.slice(-32));
}

function validHost(v) {
  const host = String(v || '').trim().toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (!host.includes('.') || host.length > 253 || host.includes(':') ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw Error();
  }
  return host;
}

// ==================== Token / 认证 ====================
const hmacCache = (raw, id) => {
  let key = macKeys.get(id);
  if (!key) macKeys.set(id, key = CRYPTO.subtle.importKey('raw', u8(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  return key;
};

const hmacAll = async (key, v) => new Uint8Array(await CRYPTO.subtle.sign('HMAC', await key, u8(v)));

async function hmacTag(seed, kind, body) {
  const prefix = txt.encode(`${kind}\n`);
  const msg = new Uint8Array(prefix.byteLength + body.byteLength);
  msg.set(prefix);
  msg.set(body, prefix.byteLength);
  return (await hmacAll(hmacCache(txt.encode(seed), `token:${seed}`), msg)).slice(0, 16);
}

/** token = b64( exp(4B) | nonce(12B) | HMAC-SHA256(seed, "kind\n" + body)[0..16] ) */
async function mintToken(seed, kind, expAt, nonce) {
  const body = new Uint8Array(4 + 12);
  const exp = Math.ceil(expAt / 1000);
  new DataView(body.buffer).setUint32(0, exp, false);
  body.set(nonce, 4);
  const token = new Uint8Array(32);
  token.set(body);
  token.set(await hmacTag(seed, kind, body), body.byteLength);
  return b64(token);
}

const mkSeed = async (seed) => mintToken(seed, 'bootstrap', Date.now() + 2 * 60 * 1000, rand(12));

async function sigCheck(v, seed, kind) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(v)) return false;
  let token;
  try { token = un64(v); } catch { return false; }
  if (token.byteLength !== 32 || b64(token) !== v) return false;
  const body = token.slice(0, 4 + 12);
  const sig = token.slice(body.byteLength);
  const exp = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, false);
  if (exp <= Math.floor(Date.now() / 1000)) return false;
  const want = await hmacTag(seed, kind, body);
  let diff = sig.byteLength ^ want.byteLength;
  for (let i = 0; i < want.length; i++) diff |= sig[i] ^ want[i];
  return diff === 0;
}

const mintSess = async (seed) => mintToken(seed, 'session', Date.now() + 5 * 60 * 1000, rand(12));
const checkSeed = async (v, seed) => v === seed || sigCheck(v, seed, 'bootstrap');

const newLease = (token) => ({
  expires: new DataView(un64(token).buffer).getUint32(0) * 1000,
  active: new Set(),
  used: new Set(),
  deleted: false,
});

const tokenFrom = (v) => /^Bearer ([^\s]+)$/.exec(v || '')?.[1] ?? null;
const isOctet = (req) => req.headers.get('Content-Type')?.trim().toLowerCase() === 'application/octet-stream';

// ==================== Hello 协议 ====================
/** 客户端 → 服务端的 9 字节握手：0x10 00 00 00 | ver=1(4B) | 1 */
function handshake(body) {
  if (body.byteLength !== 9 || body[0] !== 0x10 || body[1] !== 0 || body[2] !== 0 ||
      body[3] !== 0 || new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(4, false) !== 1 ||
      body[8] !== 1) {
    throw Error();
  }
}

const offeredProtos = (req) =>
  (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((v) => v.trim()).filter(Boolean);

// ==================== 配置解析 ====================
// 含短横线 → 纯 hex；其余格式原样返回（交给 keyFrom 校验）
function normHex(v) {
  const str = String(v || '').trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)) {
    return str.replace(/-/g, '');
  }
  return str;
}

// HMAC(seed-key, HMAC(master-key, SECRET))
// 修改任一标签会强制所有已签发 token 失效。
async function deriveSeed(rawKey) {
  const encFrame = new TextEncoder();
  const msg = encFrame.encode(String(rawKey).trim().toLowerCase());
  const mk = async (label) => CRYPTO.subtle.importKey('raw', encFrame.encode(label), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const master = await CRYPTO.subtle.sign('HMAC', await mk('tg-webpr' + 'oxy-master-v1'), msg);
  const seed = await CRYPTO.subtle.sign('HMAC', await mk('tg-webpr' + 'oxy-boot-v1'), master);
  return [...new Uint8Array(seed)].map((b) => b.toString(16).padStart(2, '0')).join(''); // 64 位 hex 字符串
}

// 首次请求计算并缓存（isolate 生命周期内复用）
let CFG_CACHE = null;
async function mkCfg(env) {
  if (CFG_CACHE) return CFG_CACHE;
  const skey = normHex(env?.SECRET || mainID);
  if (!skey) throw Error();
  const key = keyFrom(skey); // 校验 SECRET 格式（32 hex 或 dd/ee/ef 前缀）
  const seed = await deriveSeed(skey);
  CFG_CACHE = { skey, key, seed };
  return CFG_CACHE;
}

// ==================== 网关签名 ====================
async function mkCap(skey, host) {
  const key = hmacCache(keyFrom(skey, true), `bridge:${String(skey).trim().toLowerCase()}`);
  const sig = await hmacAll(key, txt.encode('tdesktop-web-pr' + 'oxy-bridge-v1\n' + validHost(host)));
  return b64(sig);
}

/** ?bridge=xxx 签名校验，通过返回 host，否则 null */
async function gate(url, skey) {
  if (url.pathname !== '/' || url.search.length !== 51) return null;
  const cand = url.search.slice(8);
  if (url.search !== `?bridge=${cand}` || !/^[A-Za-z0-9_-]{43}$/.test(cand)) return null;
  const host = validHost(url.hostname);
  const want = await mkCap(skey, host);
  if (cand.length !== want.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= cand.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0 ? host : null;
}

// ==================== AES-CTR 加密 ====================
const sha256 = async (v) => new Uint8Array(await CRYPTO.subtle.digest('SHA-256', u8(v)));

/** 计数器递增（按 16 字节块） */
function ctrStep(ctr, n) {
  let carry = n;
  for (let i = ctr.length - 1; i >= 0 && carry; i--) {
    const next = ctr[i] + (carry & 0xff);
    ctr[i] = next & 0xff;
    carry = Math.floor(carry / 256) + Math.floor(next / 256);
  }
  if (carry) throw Error();
}

/**
 * AES-CTR 流式加解密。
 * 整块时走 WebCrypto 加速；有零头时用上一次密文余量 XOR。
 */
const makeCtr = (key, ctr) => {
  let iv = dup(ctr), tail = nil;
  const ready = CRYPTO.subtle.importKey('raw', u8(key), { name: 'AES-CTR' }, false, ['encrypt']);
  const crypt = async (v) => {
    const b = u8(v);
    if (!b.byteLength) return new Uint8Array(0);
    const key = await ready;
    if (!tail.byteLength && !(b.byteLength % 16)) {
      const raw = new Uint8Array(await CRYPTO.subtle.encrypt({ name: 'AES-CTR', counter: iv.slice(), length: 128 }, key, b));
      ctrStep(iv, b.byteLength / 16);
      return raw;
    }
    if (b.byteLength <= tail.byteLength) {
      const out = new Uint8Array(b.byteLength);
      for (let i = 0; i < b.byteLength; i++) out[i] = b[i] ^ tail[i];
      tail = tail.slice(b.byteLength);
      return out;
    }
    const skip = tail.byteLength ? 16 - tail.byteLength : 0;
    const ctr = iv.slice();
    if (skip) {
      for (let i = ctr.length - 1; i >= 0; i--) if (ctr[i]--) break;
    }
    const end = skip + b.byteLength;
    const block = new Uint8Array(Math.ceil(end / 16) * 16);
    block.set(b, skip);
    const raw = new Uint8Array(await CRYPTO.subtle.encrypt({ name: 'AES-CTR', counter: ctr, length: 128 }, key, block));
    tail = raw.slice(end);
    ctrStep(iv, block.byteLength / 16 - (skip ? 1 : 0));
    return raw.subarray(skip, end);
  };
  return { crypt };
};

async function cipher(head, skey, reverse) {
  const mat = dup(u8(head).subarray(8, 56));
  if (reverse) mat.reverse();
  const key = skey.byteLength ? await sha256(cat(mat.subarray(0, 32), skey)) : mat.subarray(0, 32);
  return makeCtr(key, mat.subarray(32, 48));
}

/** 生成并预加密假头，返回外发线格式 + 对应 cipher */
async function headWire(head) {
  const ctr = await cipher(head, nil, false);
  const raw = await ctr.crypt(head);
  raw.set(u8(head).subarray(0, 56));
  return { wire: raw, cipher: ctr };
}

// ==================== 上游 WebSocket（连 TG） ====================
const upHosts = (dc, media) => [
  `kws${dc}${media ? '-1' : ''}.web.tel${'egr' + 'am'}.org`,
  `kws${dc}${media ? '' : '-1'}.web.tel${'egr' + 'am'}.org`,
];

async function connectUp({ target, media, signal }) {
  for (const host of upHosts(target + 1, media)) {
    if (signal?.aborted) throw Error();
    const url = `wss://${host}/apiws`;
    let kws;
    try {
      kws = makeWire(new WebSocket(url, 'binary'), 7500, signal);
      await kws.ready;
      if (signal?.aborted) throw Error();
      return kws;
    } catch (err) {
      kws?.close();
      if (signal?.aborted) throw err;
    }
  }
  throw Error();
}

/** 上游 WS 封装：Promise 化 + 下行打包（凑 dnPack 或 dnMs 超时再交付） */
const makeWire = (ws, ms, signal) => {
  const q = [], wait = [];
  let h = 0, qBytes = 0, closed = false, dead = false, up = false, fault = null;
  let pWake = null, pNeed, openTimer, readyOk, readyBad;

  const ready = new Promise((ok, bad) => { readyOk = ok; readyBad = bad; });

  const onAbort = () => { end(Error()); close(); };
  const onOpen = () => {
    if (closed) return;
    if (ws.protocol !== 'binary') { end(Error()); close(); return; }
    up = true;
    clearTimeout(openTimer);
    readyOk(api);
  };
  const onData = (v) => {
    if (closed) return;
    const b = v instanceof Uint8Array ? v : new Uint8Array(v);
    if (!b.byteLength) return;
    const waiter = wait.shift();
    if (waiter) waiter.resolve(b);
    else {
      q.push(b);
      qBytes += b.byteLength;
      if (pWake && (qBytes >= pNeed || b.byteLength >= CFG.dnPack)) pWake();
    }
  };
  const end = (err = null) => {
    if (closed) return;
    closed = true;
    fault = err;
    clearTimeout(openTimer);
    signal?.removeEventListener('abort', onAbort);
    if (!up) readyBad(err || Error());
    pWake?.();
    for (const waiter of wait.splice(0)) err ? waiter.reject(err) : waiter.resolve(null);
  };
  const write = async (v) => {
    await ready;
    if (closed) throw fault || Error();
    ws.send(u8(v));
  };
  const take = async () => {
    await ready;
    if (h < q.length) {
      const msg = q[h];
      q[h++] = null;
      qBytes -= msg.byteLength;
      trim();
      return msg;
    }
    if (fault) throw fault;
    if (closed) return null;
    return new Promise((ok, bad) => wait.push({ resolve: ok, reject: bad }));
  };
  const pack = async () => {
    const first = await take();
    if (dead) return null;
    if (!first || first.byteLength >= CFG.dnPack) return first;
    if (!closed && qBytes < CFG.dnPack - first.byteLength) {
      await new Promise((ok) => {
        pNeed = CFG.dnPack - first.byteLength;
        const timer = setTimeout(() => pWake?.(), CFG.dnMs);
        pWake = () => { clearTimeout(timer); pWake = null; ok(); };
      });
    }
    if (dead) return null;
    let n = first.byteLength, end = h;
    while (end < q.length && n + q[end].byteLength <= CFG.dnPack) {
      n += q[end++].byteLength;
    }
    if (end === h) return first;
    const b = new Uint8Array(n);
    b.set(first);
    let o = first.byteLength;
    while (h < end) {
      const part = q[h];
      q[h++] = null;
      b.set(part, o);
      o += part.byteLength;
      qBytes -= part.byteLength;
    }
    trim();
    return b;
  };
  const trim = () => {
    if (h === q.length) { q.length = 0; h = 0; }
    else if (h >= 256 && h * 2 >= q.length) { q.splice(0, h); h = 0; }
  };
  const close = () => {
    if (dead) return;
    dead = true;
    if (!closed) end();
    q.length = h = qBytes = 0;
    try { ws.close(1000); } catch {}
  };
  const api = { ready, write, readPack: pack, close, get closed() { return closed; } };
  ws.binaryType = 'arraybuffer';
  ws.addEventListener('open', onOpen);
  ws.addEventListener('message', (e) => onData(e.data));
  ws.addEventListener('error', () => end(Error()));
  ws.addEventListener('close', (e) => end(e?.code && e.code !== 1000 ? Error() : null));
  openTimer = setTimeout(() => { end(Error()); close(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return api;
};

// ==================== 数据包重组 ====================
/** 按 mode 0xef（1/4 字节词头）或 0xee/0xdd（4 字节长度头）切包 */
const makePkt = (mode) => {
  let tail = nil;
  const push = (v) => {
    const b = u8(v);
    if (b.byteLength) tail = tail.byteLength ? cat(tail, b) : b;
    const pkts = [];
    let o = 0;
    for (;;) {
      const avail = tail.byteLength - o;
      let hLen, pLen;
      if (mode === 0xef) {
        if (avail < 1) break;
        let words = tail[o] & 0x7f;
        if (words === 0x7f) {
          if (avail < 4) break;
          words = tail[o + 1] | (tail[o + 2] << 8) | (tail[o + 3] << 16);
          hLen = 4;
        } else hLen = 1;
        pLen = words * 4;
      } else {
        if (avail < 4) break;
        pLen = new DataView(tail.buffer, tail.byteOffset + o, 4).getUint32(0, true) & 0x7fffffff;
        hLen = 4;
      }
      if (!pLen || pLen > 8 * 1024 * 1024) throw Error();
      const total = hLen + pLen;
      if (avail < total) break;
      pkts.push(tail.subarray(o, o + total));
      o += total;
    }
    if (o) tail = o === tail.byteLength ? nil : tail.slice(o);
    if (tail.byteLength > 8 * 1024 * 1024 + 4) throw Error();
    return pkts;
  };
  const clear = () => { tail = nil; };
  return { push, clear };
};

// ==================== 代理流（客户端 ↔ TG） ====================
const makeStream = ({ skey, emit, onClose }) => {
  let hdr = nil, cIn = null, cOut = null, kIn = null, kOut = null, peer = null, pkt = null;
  let init = false, closed = false, chain = Promise.resolve();
  const ac = new AbortController(), uq = new Set();

  // 上行合并：相邻小包拼到 upPack 一起加密发送
  const push = (v) => {
    if (closed) return Promise.reject(Error());
    const job = { bytes: u8(v) };
    uq.add(job);
    chain = chain.then(async () => {
      if (closed) throw Error();
      if (!job.bytes) return job.result;
      const jobs = [job];
      let n = job.bytes.byteLength;
      for (const next of uq) {
        if (next === job) continue;
        if (n >= CFG.upPack || n + next.bytes.byteLength > CFG.upPack) break;
        n += next.bytes.byteLength;
        jobs.push(next);
      }
      const b = jobs.length === 1 ? job.bytes : cat(...jobs.map((x) => x.bytes));
      for (const item of jobs) { uq.delete(item); item.bytes = null; }
      const out = await feed(b);
      for (const item of jobs) item.result = out;
      return out;
    });
    return chain;
  };

  const feed = async (b) => {
    if (closed) throw Error();
    if (init && peer.closed) return false;
    if (!b.byteLength) return;
    if (!init) {
      const need = 64 - hdr.byteLength;
      if (b.byteLength < need) { hdr = cat(hdr, b); return; }
      hdr = cat(hdr, b.subarray(0, need));
      await start();
      const rest = b.subarray(need);
      if (rest.byteLength) return write(rest);
      return;
    }
    return write(b);
  };

  const start = async () => {
    const raw = hdr;
    const cr = await cipher(raw, skey, false);
    const plain = await cr.crypt(raw);
    if (closed) return;
    const info = parseHead(plain);
    const head = makeHead(info.mode, info.target, info.media);
    const [cw, out, kr] = await Promise.all([
      cipher(raw, skey, true),
      headWire(head),
      cipher(head, nil, true),
    ]);
    if (closed) return;
    const kws = await connectUp({ target: info.target, media: info.media, signal: ac.signal });
    if (closed) { kws.close(); return; }
    peer = kws;
    cIn = cr; cOut = cw; kOut = out.cipher; kIn = kr;
    pkt = makePkt(info.mode);
    await kws.write(out.wire);
    if (closed) return;
    hdr = nil;
    init = true;
    pump().catch(() => close());
  };

  const write = async (raw) => {
    if (closed || peer.closed) return false;
    const plain = await cIn.crypt(raw);
    if (closed || peer.closed) return false;
    const pkts = pkt.push(plain);
    for (let start = 0; start < pkts.length;) {
      let end = start + 1, n = pkts[start].byteLength;
      while (end < pkts.length && n + pkts[end].byteLength <= CFG.upPack) {
        n += pkts[end++].byteLength;
      }
      const first = pkts[start];
      const b = end === start + 1 ? first : new Uint8Array(first.buffer, first.byteOffset, n);
      if (closed || peer.closed) return false;
      const wire = await kOut.crypt(b);
      for (let o = 0; start < end; start++) {
        if (closed || peer.closed) return false;
        const n = pkts[start].byteLength;
        try { await peer.write(wire.subarray(o, o + n)); } catch (err) {
          if (closed || peer.closed) return false;
          throw err;
        }
        o += n;
      }
    }
  };

  const pump = async () => {
    while (!closed) {
      const b = await peer.readPack();
      if (closed) return;
      if (!b) return close();
      const plain = await kIn.crypt(b);
      if (closed) return;
      const raw = await cOut.crypt(plain);
      if (closed) return;
      await emit(raw);
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    ac.abort();
    try { peer?.close(); } catch {}
    for (const job of uq) job.bytes = null;
    uq.clear();
    hdr = nil;
    pkt?.clear();
    cIn = cOut = kIn = kOut = peer = null;
    try { onClose(); } catch {}
  };

  return { push, close };
};

const makeSess = ({ skey, sid, onClose, lease }) => {
  let sock = null, closed = false, tx = Promise.resolve(), cur = null;

  const attach = (ws) => {
    if (sock || closed) throw Error();
    sock = ws;
    ws.accept({ allowHalfOpen: true });
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('message', (e) => {
      if (closed) return;
      try { onData(e.data); } catch { close(1008); }
    });
    ws.addEventListener('close', () => close());
    ws.addEventListener('error', () => close());
  };

  const onData = (v) => {
    if (closed) return;
    if (lease?.deleted) { return close(1000); }
    if (typeof v === 'string') throw Error();
    const b = v instanceof Uint8Array ? v : new Uint8Array(v);
    if (!b.byteLength || b.byteLength > 2 * 1024 * 1024) { throw Error(); }
    for (const frame of splitFrames(b)) {
      if (closed) return;
      const delta = checkFrame(frame);
      if (frame.sid !== sid) throw Error();
      if (!cur && frame.type !== 1) throw Error();
      if (frame.type !== 1 && cur?.closed) continue;
      if (frame.type === 1) open();
      else if (frame.type === 2) write(frame.payload);
      else if (frame.type === 4) grant(delta);
      else if (frame.type === 3) end(false);
      else throw Error();
    }
  };

  // 串行发送，保证帧顺序
  const send = (type, data = nil) => {
    const out = encFrame(type, sid, data);
    const st = type === 2 || type === 4 ? cur : null;
    tx = tx.then(() => {
      if (closed) throw Error();
      if ((type === 2 || type === 4) && (!st || st.closed)) return;
      sock.send(out);
    });
    return tx;
  };

  const open = () => {
    if (closed) return;
    if (cur) throw Error();
    const st = { in: 4 * 1024 * 1024, out: 4 * 1024 * 1024, wake: null, closed: false, up: null, pItems: 0 };
    st.up = makeStream({
      skey,
      emit: (b) => emitDn(st, b),
      onClose: () => { if (!closed && !st.closed) end(true); },
    });
    cur = st;
  };

  const write = (data) => {
    if (closed || cur?.closed) return;
    const st = cur;
    if (!st || st.closed) throw Error();
    const n = data.byteLength;
    if (n > st.in) throw Error();
    if (st.pItems >= 16384) { throw Error(); }
    st.in -= n;
    st.pItems++;
    st.up.push(data).then((accepted) => {
      freeUp(st);
      if (closed || st.closed || accepted === false) return;
      st.in += n;
      const delta = new Uint8Array(4);
      new DataView(delta.buffer).setUint32(0, n);
      send(4, delta).catch(() => close());
    }, () => {
      freeUp(st);
      if (!closed && !st.closed) st.up.close();
    }).catch(() => close());
  };

  const freeUp = (st) => { if (st.closed) return; st.pItems--; };

  const emitDn = async (st, b) => {
    for (let o = 0; o < b.byteLength;) {
      while (!closed && !st.closed && st.out === 0) {
        await new Promise((ok) => { st.wake = ok; });
      }
      if (closed || st.closed) throw Error();
      const n = Math.min(64 * 1024, b.byteLength - o, st.out);
      st.out -= n;
      await send(2, b.subarray(o, o + n));
      o += n;
    }
  };

  const grant = (n) => {
    if (closed || cur?.closed) return;
    const st = cur;
    if (!st || st.closed) throw Error();
    st.out = Math.min(0xffffffff, st.out + n);
    wake(st);
  };

  const stop = (st) => { st.closed = true; st.pItems = 0; wake(st); st.up.close(); };

  const end = (notify) => {
    if (closed || cur?.closed) return;
    const st = cur;
    if (!st) throw Error();
    stop(st);
    if (notify) send(3).then(() => close(), () => close());
    else close();
  };

  const close = (code = 1000, reason = '') => {
    if (closed) return;
    closed = true;
    if (cur) stop(cur);
    cur = null;
    try { sock?.close(code, reason); } catch {}
    onClose?.();
    onClose = null;
  };

  return { attach, close };
};

function mkPage(host, seed) {
  const nonce = b64(rand(18));
  const body = `<script nonce="__NONCE__">
(()=>{'use strict'; const origin=__ORIGIN__,seed=__BOOTSTRAP__;
const aNonce=/^#android=([A-Za-z0-9_-]{43})$/.exec(location.hash)?.[1]??''; history.replaceState(null,'',location.pathname);
let init=false,closed=false,port=null,token='',started=false,delSent=false; let qBytes=0,qItems=0;
const lanes=new Map(),used=new Set(),qMax=33554432,iMax=16384,msgMax=2097152; const laneMax=8388608,laneItems=1024;
const state=st=>port&&!closed&&port.postMessage({t:'status',state:st});
const opts=(method,token,body,keepalive)=>({ method,body,keepalive:!!keepalive,mode:'same-origin',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer', headers:{...(token&&{Authorization:'Bearer '+token}),...(body&&{'Content-Type':'application/octet-stream'})} });
function checkFrame(v){ if(!(v instanceof ArrayBuffer)||!v.byteLength||v.byteLength>msgMax)throw Error(); const view=new DataView(v);let o=0,splitFrames=0; while(o<v.byteLength){ if(v.byteLength-o<8||splitFrames++>=4096)throw Error(); const type=view.getUint8(o),n=view.getUint32(o+4),end=o+8+n; if(n>1048576||end>v.byteLength||(type===2&&!n))throw Error(); o=end; } return v; }
function split(v){ checkFrame(v);const view=new DataView(v),out=[];let o=0; while(o<v.byteLength){ const end=o+8+view.getUint32(o+4); out.push(o===0&&end===v.byteLength?v:v.slice(o,end));o=end; } return out; }
function sid(v){const b=new Uint8Array(v);return (b[1]<<16)|(b[2]<<8)|b[3];}
function hold(lane,v){ let buffered=0;for(const {ws} of lanes.values())buffered+=ws?.bufferedAmount??0; const own=lane.ws?.bufferedAmount??0; if(qBytes+buffered>qMax-v.byteLength||qItems>=iMax ||lane.bytes+own>laneMax-v.byteLength||lane.items>=laneItems)return false; qBytes+=v.byteLength;qItems++;lane.bytes+=v.byteLength;lane.items++;return true; }
function free(lane,v){qBytes-=v.byteLength;qItems--;lane.bytes-=v.byteLength;lane.items--;}
function fail(){ if(closed)return;state('failed');port?.postMessage({t:'close'});close(true); }
function drop(){ if(delSent||!token)return;delSent=true; fetch(origin+'/api/v1/session',opts('DELETE',token,null,true)).catch(()=>{}); }
function pump(lane){ const ws=lane.ws; if(closed||lane.done||!ws||ws.readyState!==WebSocket.OPEN||!lane.pending.length)return; if(ws.bufferedAmount>=msgMax){lane.timer ||= setTimeout(()=>{lane.timer=0;pump(lane);},10);return;} try{ const v=lane.pending.shift();ws.send(v);free(lane,v); port.postMessage({t:'traffic',up:v.byteLength,down:0}); if(lane.pending.length)queueMicrotask(()=>pump(lane)); }catch{fail();} }
function push(v){ try{for(const frame of split(v))pushLane(frame);} catch{fail();} }
function end(lane,notify){ if(lane.done)return;lane.done=true;if(lane.timer)clearTimeout(lane.timer); qBytes-=lane.bytes;qItems-=lane.items;lane.bytes=lane.items=0;lane.pending.length=0;lanes.delete(lane.id); try{lane.ws?.close();}catch{} if(notify&&port&&!closed){const frame=new ArrayBuffer(8),b=new Uint8Array(frame);b[0]=3;b[1]=lane.id>>>16;b[2]=lane.id>>>8;b[3]=lane.id;port.postMessage(frame,[frame]);} }
function open(lane){ const target=origin.replace(/^https:/,'wss:')+'/api/v1/ws'; const ws=lane.ws=new WebSocket(target,'tpr'+'oxy-lane-v1.'+token+'.'+lane.id);ws.binaryType='arraybuffer'; ws.onopen=()=>{if(closed||lane.done){ws.close();return;}lane.opened=true;state('connected');pump(lane);}; ws.onmessage=e=>{ if(closed||lane.done)return; try{ const splitFrames=split(e.data); if(splitFrames.some(frame=>sid(frame)!==lane.id))throw Error(); const ended=splitFrames.some(frame=>new Uint8Array(frame)[0]===3); if(ended)lane.rClosed=true; port.postMessage({t:'traffic',up:0,down:e.data.byteLength});port.postMessage(e.data,[e.data]);state('connected'); if(ended)end(lane,false); }catch{fail();} }; ws.onerror=()=>{}; ws.onclose=()=>{if(closed||lane.done)return;if(!lane.opened){fail();return;}end(lane,!lane.lClosed&&!lane.rClosed);}; }
function pushLane(v){ const id=sid(v),type=new Uint8Array(v)[0];let lane=lanes.get(id); if(!id)throw Error(); if(!lane&&(type===2||type===3||type===4))return; if(!lane){ if(type!==1||used.has(id)||lanes.size>=128||used.size>=4096)throw Error(); used.add(id);lane={id,ws:null,pending:[],bytes:0,items:0,timer:0,opened:false,done:false,lClosed:false,rClosed:false};lanes.set(id,lane); } if(lane.lClosed)return; if(type===3&&!lane.opened){end(lane,false);return;} if(!hold(lane,v))throw Error(); lane.pending.push(v);if(type===3)lane.lClosed=true; if(token){if(!lane.ws)open(lane);else pump(lane);} }
async function create(first){ try{ state('connecting'); const res=await fetch(origin+'/api/v1/session',opts('POST',seed,first)); if(res.status!==200||res.headers.get('X-Carrier-Mode')!=='websocket-lanes')throw Error(); token=res.headers.get('X-Session-Token')??''; if(!token)throw Error(); const welcome=await res.arrayBuffer();checkFrame(welcome); if(closed){drop();return;} port.postMessage(welcome,[welcome]);state('connected'); for(const lane of lanes.values())if(!lane.ws)open(lane); }catch{fail();} }
function close(notify){ if(closed)return;closed=true; for(const lane of [...lanes.values()])end(lane,false);used.clear(); if(notify)drop(); port?.close(); }
function start(next){ init=true;port=next; port.onmessage=msg=>{ const data=msg.data; if(data instanceof ArrayBuffer){ if(!started){ try{checkFrame(data);}catch{fail();return;} started=true;create(data); }else push(data); }else if(data&&data.t==='close')close(true); }; port.start();state('connecting'); }
addEventListener('message',e=>{ if(init||e.source!==parent||e.data===null||typeof e.data!=='object')return; const keys=Object.keys(e.data).sort(); if(keys.length!==2||keys[0]!=='t'||keys[1]!=='v'||e.data.t!=='tpr'+'oxy-init'||e.data.v!==1||e.ports.length!==1)return; let src;try{src=new URL(e.origin);}catch{return;} if(src.protocol!=='http:'||src.hostname!=='127.0.0.1'||!src.port||src.origin!==e.origin)return; start(e.ports[0]); }); const android=globalThis['Tel'+'egram'+'Web'+'Proxy'];
if(!init&&aNonce&&android&&typeof android.postMessage==='function'){ const aPort={onmessage:null,start(){},close(){android.onmessage=null;},postMessage(v){ if(v instanceof ArrayBuffer){for(const frame of split(v))android.postMessage(frame);} else android.postMessage(JSON.stringify(v)); }}; android.onmessage=e=>{ let data=e.data;if(typeof data==='string'){try{data=JSON.parse(data);}catch{return;}} aPort.onmessage?.({data}); }; start(aPort);android.postMessage(JSON.stringify({t:'tpr'+'oxy-android-init',v:1,nonce:aNonce})); } addEventListener('pagehide',()=>close(true),{once:true}); })();
</script>`.replaceAll('__NONCE__', nonce).replace('__ORIGIN__', JSON.stringify(`https://${host}`))
    .replace('__BOOTSTRAP__', JSON.stringify(String(seed)));

  const csp = [
    "default-src 'none'", "base-uri 'none'", "child-src 'none'",
    `connect-src 'self' wss://${host}`, "font-src 'none'", "form-action 'none'",
    'frame-ancestors http://127.0.0.1:*', "frame-src 'none'", "img-src 'none'",
    "manifest-src 'none'", "media-src 'none'", "object-src 'none'",
    `script-src 'nonce-${nonce}'`, "style-src 'none'", "worker-src 'none'",
    'sandbox allow-same-origin allow-scripts',
  ].join('; ');

  return { body, csp };
}

// ==================== TG 代理路由 ====================
/** /api/v1/session：会话创建(POST)与删除(DELETE) */
async function sessApi(request, env) {
  let cfg;
  try { cfg = await mkCfg(env); } catch { return reply(null, 500); }
  const method = request.method;
  const auth = tokenFrom(request.headers.get('Authorization'));
  if (method === 'DELETE') {
    if (!auth || !(await sigCheck(auth, cfg.seed, 'session'))) { return reply(); }
    let lease = leases.get(auth);
    if (!lease) leases.set(auth, lease = newLease(auth));
    lease.deleted = true;
    return reply(null, 204);
  }
  if (method !== 'POST' || !auth || !isOctet(request)) { return reply(); }
  if (!(await checkSeed(auth, cfg.seed))) { return reply(); }
  try {
    const body = new Uint8Array(await request.arrayBuffer());
    handshake(body);
    const token = await mintSess(cfg.seed);
    return new Response(encFrame(0x11, 0), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Session-Token': token,
        'X-Carrier-Mode': 'websocket-lanes',
      },
    });
  } catch { return reply(); }
}

/** /api/v1/ws：lanes WebSocket 升级 */
async function laneApi(request, env, url) {
  let cfg;
  try { cfg = await mkCfg(env); } catch { return reply(null, 500); }
  const headers = request.headers;
  if (request.method !== 'GET' ||
      headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
      (headers.has('Origin') && headers.get('Origin') !== url.origin)) {
    return reply();
  }

  const offers = offeredProtos(request);
  const proto = offers.length === 1 ? offers[0] : null;
  const parts = proto?.split('.') ?? [];
  const [kind, token = '', id] = parts;
  const laneId = Number(id);
  if (parts.length !== 3 || kind !== 'tpr' + 'oxy-lane-v1' ||
      !/^[1-9][0-9]{0,7}$/.test(id) || laneId > 0xffffff ||
      !(await sigCheck(token, cfg.seed, 'session'))) {
    return reply();
  }

  const now = Date.now();
  for (const [key, v] of leases) if (v.expires <= now && !v.active.size) leases.delete(key);
  let lease = leases.get(token);
  if (!lease) {
    if (leases.size >= 4096) return reply(null, 503);
    leases.set(token, lease = newLease(token));
  }
  if (lease.deleted || lease.used.has(laneId) || lease.active.size >= 128 || lease.used.size >= 4096) {
    return reply(null, 409);
  }
  lease.used.add(laneId);
  lease.active.add(laneId);

  const sess = makeSess({ skey: cfg.key, sid: laneId, lease, onClose: () => lease.active.delete(laneId) });
  const { 0: client, 1: server } = new WebSocketPair();
  try { sess.attach(server); } catch { sess.close(); return reply(null, 409); }
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: { 'Sec-WebSocket-Protocol': proto, 'Sec-WebSocket-Extensions': '' },
  });
}

/** /?bridge=xxx：非 bridge 请求返回 null 走主页 */
async function gatePage(request, env, url) {
  if (request.method !== 'GET') return null;
  let cfg;
  try { cfg = await mkCfg(env); } catch { return null; }
  let host = null;
  try { host = await gate(url, cfg.skey); } catch { host = null; }
  if (!host) return null;
  const seed = await mkSeed(cfg.seed);
  const page = mkPage(host, seed);
  return new Response(page.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': page.csp,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': [
        'accelerometer=()', 'autoplay=()', 'camera=()',
        'clipboard-read=()', 'clipboard-write=()', 'display-capture=()',
        'encrypted-media=()', 'fullscreen=()', 'geolocation=()',
        'gyroscope=()', 'hid=()', 'idle-detection=()', 'magnetometer=()',
        'microphone=()', 'midi=()', 'payment=()', 'picture-in-picture=()',
        'publickey-credentials-create=()', 'publickey-credentials-get=()',
        'screen-wake-lock=()', 'serial=()', 'usb=()', 'web-share=()',
        'xr-spatial-tracking=()',
      ].join(', '),
    },
  });
}

/**
 * 
 * @param {import("@cloudflare/workers-types").Request} request
 */
function getHomePage(request, env) {
	const url = request.headers.get('Host');
	const baseUrl = `https://${url}`;
	const urlObj = new URL(request.url);
	const providedPassword = urlObj.searchParams.get('password');
	const authKey = normHex(env?.SECRET || mainID);
	if (providedPassword) {
		if (providedPassword === password) {
			return getMainPageContent(url, baseUrl, authKey);
		} else {
			return getLoginPage(url, baseUrl, true);
		}
	}
	return getLoginPage(url, baseUrl, false);
}


// 获取登录页面
function getLoginPage(url, baseUrl, showError = false) {
	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Service - 登录</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            background: linear-gradient(135deg, #0b0b10 0%, #17110b 45%, #2b1606 100%);
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #e2e8f0;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        
        .bg-orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(70px);
            pointer-events: none;
            z-index: 0;
        }
        
        .orb-1 {
            width: 340px;
            height: 340px;
            background: rgba(249, 115, 22, .26);
            top: -90px;
            left: -90px;
            animation: drift 16s ease-in-out infinite;
        }
        
        .orb-2 {
            width: 300px;
            height: 300px;
            background: rgba(234, 88, 12, .22);
            bottom: -80px;
            right: -70px;
            animation: drift 20s ease-in-out infinite reverse;
        }
        
        @keyframes drift {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(36px, 28px); }
        }
        
        .login-container {
            position: relative;
            z-index: 1;
            background: rgba(22, 19, 16, .82);
            backdrop-filter: blur(18px);
            border: 1px solid rgba(255, 255, 255, .08);
            border-radius: 24px;
            padding: 40px 36px;
            box-shadow: 0 24px 64px rgba(0, 0, 0, .55);
            max-width: 400px;
            width: 95%;
            text-align: center;
        }
        
        .logo svg {
            width: 66px;
            height: 66px;
            display: block;
            margin: 0 auto;
            border-radius: 50%;
            box-shadow: 0 10px 24px rgba(249, 115, 22, .35);
        }
        
        .title {
            font-size: 1.7rem;
            font-weight: 800;
            margin: 12px 0 8px;
            background: linear-gradient(90deg, #fdba74, #fb923c 55%, #f59e0b);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
            color: #94a3b8;
            margin-bottom: 28px;
            font-size: .95rem;
        }
        
        .form-group {
            margin-bottom: 20px;
            text-align: left;
        }
        
        .form-input {
            width: 100%;
            padding: 13px 16px;
            border: 2px solid rgba(255, 255, 255, .12);
            border-radius: 12px;
            font-size: 1rem;
            transition: all 0.3s ease;
            background: rgba(255, 255, 255, .06);
            color: #f1f5f9;
        }
        
        .form-input::placeholder {
            color: #6b7280;
        }
        
        .form-input:focus {
            outline: none;
            border-color: #f97316;
            background: rgba(255, 255, 255, .08);
            box-shadow: 0 0 0 4px rgba(249, 115, 22, .18);
        }
        
        .btn-login {
            width: 100%;
            padding: 13px 20px;
            background: linear-gradient(135deg, #ea580c 0%, #f59e0b 100%);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .btn-login:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 24px rgba(249, 115, 22, .45);
        }
        
        .btn-login:active {
            transform: translateY(0);
        }
        
        .error-message {
            background: rgba(239, 68, 68, .14);
            color: #fca5a5;
            padding: 11px;
            border-radius: 10px;
            margin-bottom: 18px;
            border-left: 4px solid #ef4444;
            font-size: .9rem;
        }
        
        .footer {
            margin-top: 22px;
            color: #71717a;
            font-size: .85rem;
        }
        
        .footer a {
            color: #fb923c;
            text-decoration: none;
            font-weight: 500;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
        
        @media (max-width: 480px) {
            .login-container {
                padding: 30px 22px;
                margin: 10px;
            }
            
            .title {
                font-size: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="login-container">
        <div class="logo"><svg width="100%" height="100%" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><circle cx="512" cy="512" r="512" style="fill:#f38020"></circle><path d="M608.2 592.4c3.1-10.8 1.9-20.7-3.3-28.1-4.8-6.7-12.9-10.6-22.6-11.1l-184.7-2.4c-1.1 0-2.2-.6-2.8-1.5-.6-.9-.7-2.1-.4-3.3.6-1.8 2.4-3.2 4.3-3.3l186.4-2.4c22.1-1 46.1-18.9 54.5-40.8l10.6-27.8c.5-1.2.6-2.4.3-3.6-12-54.3-60.5-94.8-118.4-94.8-53.4 0-98.7 34.5-114.9 82.4-10.5-7.8-23.9-12-38.3-10.6-25.7 2.5-46.2 23.1-48.8 48.8-.6 6.6-.1 13.1 1.4 19.1-41.9 1.2-75.3 35.4-75.3 77.6 0 3.7.3 7.5.8 11.2.3 1.8 1.8 3.1 3.6 3.1h340.9c1.9 0 3.8-1.4 4.3-3.3l2.4-9.2zM667 473.7c-1.6 0-3.4 0-5.1.2-1.2 0-2.2.9-2.7 2.1l-7.2 25c-3.1 10.8-2 20.7 3.3 28.1 4.8 6.7 12.9 10.6 22.7 11.1l39.3 2.4c1.2 0 2.3.6 2.8 1.5.6.9.7 2.3.5 3.3-.6 1.8-2.4 3.2-4.4 3.3l-41 2.4c-22.2 1-46 18.9-54.5 40.8l-3 7.6c-.6 1.5.5 3 2.1 3h140.8c1.6 0 3.1-1 3.6-2.7 2.4-8.7 3.7-17.9 3.7-27.3 0-55.5-45.3-100.8-101-100.8" style="fill:#fff"></path></svg></div>
        <h1 class="title">Cloudflare Service</h1>
        <p class="subtitle">请输入密码以访问服务</p>
        
        ${showError ? '<div class="error-message">密码错误,请重试</div>' : ''}
        
        <form onsubmit="handleLogin(event)">
            <div class="form-group">
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    class="form-input" 
                    placeholder="请输入密码"
                    required
                    autofocus
                >
            </div>
            <button type="submit" class="btn-login">登录</button>
        </form>
        
        <div class="footer">
            <p>Powered by eooce <a href="https://t.${'me'}/eooceu" target="_blank">Join ${'Tel' + 'egram'} group</a></p>
        </div>
    </div>
    
    <script>
        function handleLogin(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.set('password', password);
            window.location.href = currentUrl.toString();
        }
    <\/script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

/**
 * 获取主页内容(密码验证通过后显示)
 * @param {string} url 
 * @param {string} baseUrl 
 * @param {string} authKey TG 代理密钥
 * @returns {Response}
 */
function getMainPageContent(url, baseUrl, authKey) {
	const subA = `${baseUrl}/${subPath}`;
	const subB = `https://sublink.eooce.com/${'c' + 'lash'}?config=${baseUrl}/${subPath}`;
	const subC = `https://sublink.eooce.com/${'sing' + 'box'}?config=${baseUrl}/${subPath}`;
	const shareLink = 'https://t.' + 'me/webpr' + 'oxy?server=' + url + '&secret=' + authKey;

	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Service</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            background: linear-gradient(135deg, #0d9488 0%, #0d9488 38%, #ea580c 80%, #f59e0b 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1e293b;
            padding: 24px 12px;
            overflow-x: hidden;
        }
        
        .bg-orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(70px);
            pointer-events: none;
            z-index: 0;
        }
        
        .orb-1 {
            width: 340px;
            height: 340px;
            background: rgba(45, 212, 191, .5);
            top: -90px;
            left: -90px;
            animation: drift 16s ease-in-out infinite;
        }
        
        .orb-2 {
            width: 300px;
            height: 300px;
            background: rgba(249, 115, 22, .32);
            bottom: -80px;
            right: -70px;
            animation: drift 20s ease-in-out infinite reverse;
        }
        
        .orb-3 {
            width: 220px;
            height: 220px;
            background: rgba(245, 158, 11, .32);
            top: 42%;
            left: 68%;
            animation: drift 24s ease-in-out infinite;
        }
        
        @keyframes drift {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(36px, 28px); }
        }
        
        .container {
            position: relative;
            z-index: 1;
            background: rgba(255, 255, 255, .96);
            backdrop-filter: blur(18px);
            border: 1px solid rgba(255, 255, 255, .7);
            border-radius: 24px;
            padding: 30px 24px 20px;
            box-shadow: 0 24px 64px rgba(15, 23, 42, .3);
            max-width: 920px;
            width: 100%;
            text-align: center;
        }
        
        .logout-btn {
            position: fixed;
            top: 18px;
            right: 18px;
            z-index: 1000;
            background: rgba(255, 255, 255, .18);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, .4);
            backdrop-filter: blur(8px);
            border-radius: 99px;
            padding: 8px 16px;
            font-size: .85rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 7px;
            transition: all 0.25s ease;
        }
        
        .logout-btn:hover {
            background: rgba(255, 255, 255, .32);
            transform: translateY(-1px);
        }
        
        .logo svg {
            width: 66px;
            height: 66px;
            display: block;
            margin: 0 auto;
            border-radius: 50%;
            box-shadow: 0 10px 24px rgba(234, 88, 12, .3);
        }
        
        .title {
            font-size: 1.7rem;
            font-weight: 800;
            letter-spacing: .5px;
            margin-top: 12px;
            background: linear-gradient(90deg, #0d9488 0%, #ea580c 72%, #f59e0b 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
            color: #64748b;
            font-size: .92rem;
            margin-top: 6px;
        }
        
        .section-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            padding: 8px;
            margin-top: 22px;
            text-align: left;
        }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px 8px;
        }
        
        .section-title {
            font-size: 1rem;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .section-title i {
            color: #ea580c;
        }
        
        .section-hint {
            font-size: .74rem;
            color: #94a3b8;
            background: #eef2f7;
            padding: 4px 12px;
            border-radius: 99px;
            white-space: nowrap;
        }
        
        .link-item {
            display: flex;
            align-items: center;
            gap: 13px;
            padding: 11px 12px;
            border-radius: 13px;
            cursor: pointer;
            user-select: none;
            transition: background .2s ease, transform .2s ease, box-shadow .2s ease;
        }
        
        .link-item:hover {
            background: #ffffff;
            box-shadow: 0 6px 18px rgba(15, 23, 42, .08);
            transform: translateY(-1px);
        }
        
        .link-item:active {
            transform: scale(.985);
        }
        
        .link-icon {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 1.05rem;
            box-shadow: 0 4px 12px rgba(15, 23, 42, .14);
        }
        
        .icon-k1 { background: linear-gradient(135deg, #f59e0b, #ef4444); }
        .icon-k2 { background: linear-gradient(135deg, #06b6d4, #2563eb); }
        .icon-k3 { background: linear-gradient(135deg, #8b5cf6, #d946ef); }
        .icon-tg { background: linear-gradient(135deg, #38bdf8, #0369a1); }
        
        .link-info {
            flex: 1;
            min-width: 0;
        }
        
        .link-label {
            font-weight: 600;
            font-size: .92rem;
            color: #0f172a;
        }
        
        .link-value {
            font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
            font-size: .74rem;
            color: #64748b;
            margin-top: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .copy-icon {
            color: #a8b3c5;
            font-size: 1rem;
            flex-shrink: 0;
            transition: color .2s ease, transform .2s ease;
        }
        
        .link-item:hover .copy-icon {
            color: #ea580c;
            transform: scale(1.15);
        }
        
        .info-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            padding: 4px 18px;
            margin-top: 14px;
            text-align: left;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px dashed #e2e8f0;
            font-size: .88rem;
        }
        
        .info-item:last-child {
            border-bottom: none;
        }
        
        .label {
            font-weight: 600;
            color: #475569;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        
        .value {
            color: #0f172a;
            font-family: Consolas, 'Courier New', monospace;
            font-size: .78rem;
            background: #eef2f7;
            padding: 5px 10px;
            border-radius: 8px;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .status {
            display: inline-block;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: #10b981;
            margin-right: 7px;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: .4; }
            100% { opacity: 1; }
        }
        
        .footer {
            margin-top: 18px;
            padding-top: 14px;
            border-top: 1px solid #eef2f7;
        }
        
        .footer-links {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: center;
        }
        
        .footer-link {
            color: #64748b;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: .82rem;
            font-weight: 500;
            padding: 6px 13px;
            border-radius: 99px;
            background: #f1f5f9;
            transition: all .25s ease;
        }
        
        .footer-link:hover {
            background: linear-gradient(90deg, #0d9488, #ea580c);
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 6px 14px rgba(234, 88, 12, .35);
        }
        
        .github-icon {
            width: 14px;
            height: 14px;
            fill: currentColor;
        }
        
        .toast {
            position: fixed;
            top: 22px;
            left: 50%;
            z-index: 2000;
            transform: translate(-50%, -90px);
            opacity: 0;
            background: rgba(15, 23, 42, .92);
            color: #fff;
            padding: 11px 20px;
            border-radius: 99px;
            display: flex;
            align-items: center;
            gap: 9px;
            font-size: .9rem;
            font-weight: 500;
            box-shadow: 0 10px 30px rgba(15, 23, 42, .35);
            max-width: 88vw;
            transition: transform .35s cubic-bezier(.175, .885, .32, 1.2), opacity .35s ease;
        }
        
        .toast.show {
            transform: translate(-50%, 0);
            opacity: 1;
        }
        
        .toast-icon {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #10b981;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: bold;
            flex-shrink: 0;
        }
        
        .toast.error .toast-icon {
            background: #ef4444;
        }
        
        @media (max-width: 640px) {
            body {
                padding: 14px 8px;
                align-items: flex-start;
            }
            
            .container {
                padding: 22px 12px 14px;
                border-radius: 20px;
            }
            
            .title {
                font-size: 1.45rem;
            }
            
            .subtitle {
                font-size: .85rem;
            }
            
            .link-item {
                padding: 10px;
                gap: 10px;
            }
            
            .link-icon {
                width: 38px;
                height: 38px;
                border-radius: 11px;
                font-size: .95rem;
            }
            
            .link-label {
                font-size: .88rem;
            }
            
            .link-value {
                font-size: .68rem;
            }
            
            .section-card {
                padding: 6px;
            }
            
            .info-card {
                padding: 2px 14px;
            }
            
            .info-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 6px;
                padding: 10px 0;
            }
            
            .footer-links {
                gap: 6px;
            }
            
            .footer-link {
                padding: 5px 10px;
                font-size: .78rem;
            }
            
            .section-hint {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-orb orb-3"></div>

    <button onclick="logout()" class="logout-btn">
        <i class="fas fa-sign-out-alt"></i>
        <span>退出登录</span>
    </button>
    
    <div class="container">
        <div class="logo"><svg width="100%" height="100%" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><circle cx="512" cy="512" r="512" style="fill:#f38020"></circle><path d="M608.2 592.4c3.1-10.8 1.9-20.7-3.3-28.1-4.8-6.7-12.9-10.6-22.6-11.1l-184.7-2.4c-1.1 0-2.2-.6-2.8-1.5-.6-.9-.7-2.1-.4-3.3.6-1.8 2.4-3.2 4.3-3.3l186.4-2.4c22.1-1 46.1-18.9 54.5-40.8l10.6-27.8c.5-1.2.6-2.4.3-3.6-12-54.3-60.5-94.8-118.4-94.8-53.4 0-98.7 34.5-114.9 82.4-10.5-7.8-23.9-12-38.3-10.6-25.7 2.5-46.2 23.1-48.8 48.8-.6 6.6-.1 13.1 1.4 19.1-41.9 1.2-75.3 35.4-75.3 77.6 0 3.7.3 7.5.8 11.2.3 1.8 1.8 3.1 3.6 3.1h340.9c1.9 0 3.8-1.4 4.3-3.3l2.4-9.2zM667 473.7c-1.6 0-3.4 0-5.1.2-1.2 0-2.2.9-2.7 2.1l-7.2 25c-3.1 10.8-2 20.7 3.3 28.1 4.8 6.7 12.9 10.6 22.7 11.1l39.3 2.4c1.2 0 2.3.6 2.8 1.5.6.9.7 2.3.5 3.3-.6 1.8-2.4 3.2-4.4 3.3l-41 2.4c-22.2 1-46 18.9-54.5 40.8l-3 7.6c-.6 1.5.5 3 2.1 3h140.8c1.6 0 3.1-1 3.6-2.7 2.4-8.7 3.7-17.9 3.7-27.3 0-55.5-45.3-100.8-101-100.8" style="fill:#fff"></path></svg></div>
        <h1 class="title">Cloudflare Service</h1>
        <p class="subtitle">基于 Cloudflare 的高性能网络服务 (${VLS} + ${TRO} + ${'Tel' + 'egram'} ${'WebPr' + 'oxy'})</p>
        
        <div class="section-card">
            <div class="section-header">
                <div class="section-title"><i class="fas fa-share-nodes"></i> 订阅与分享</div>
                <span class="section-hint">点击任意条目即可复制</span>
            </div>
            
            <div class="link-item" onclick="copyKey('k1', '${'V2' + 'rayN'} 订阅链接')">
                <div class="link-icon icon-k1"><i class="fas fa-network-wired"></i></div>
                <div class="link-info">
                    <div class="link-label">${'V2' + 'rayN'} 订阅</div>
                    <div class="link-value" title="${subA}">${subA}</div>
                </div>
                <i class="far fa-copy copy-icon"></i>
            </div>
            
            <div class="link-item" onclick="copyKey('k2', '${'C' + 'lash'} 订阅链接')">
                <div class="link-icon icon-k2"><i class="fas fa-bolt"></i></div>
                <div class="link-info">
                    <div class="link-label">${'C' + 'lash'} 订阅</div>
                    <div class="link-value" title="${subB}">${subB}</div>
                </div>
                <i class="far fa-copy copy-icon"></i>
            </div>
            
            <div class="link-item" onclick="copyKey('k3', '${'sing' + 'box'} 订阅链接')">
                <div class="link-icon icon-k3"><i class="fas fa-cube"></i></div>
                <div class="link-info">
                    <div class="link-label">${'sing' + 'box'} 订阅</div>
                    <div class="link-value" title="${subC}">${subC}</div>
                </div>
                <i class="far fa-copy copy-icon"></i>
            </div>
            
            <div class="link-item" onclick="copyKey('tg', '${'Tel' + 'egram WebPr' + 'oxy'} 分享链接')">
                <div class="link-icon icon-tg"><i class="fab fa-tel${'egr' + 'am'}-plane"></i></div>
                <div class="link-info">
                    <div class="link-label">${'Tel' + 'egram WebPr' + 'oxy'} 分享链接</div>
                    <div class="link-value" title="${shareLink}">${shareLink}</div>
                </div>
                <i class="far fa-copy copy-icon"></i>
            </div>
        </div>
        
        <div class="info-card">
            <div class="info-item">
                <span class="label">服务状态</span>
                <span class="value"><span class="status"></span>运行中</span>
            </div>
            <div class="info-item">
                <span class="label">主机地址</span>
                <span class="value">${url}</span>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-links">
                <a href="https://github.com/eooce/CF-Workers-${VLS}" target="_blank" class="footer-link">
                    <svg class="github-icon" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.479-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span>GitHub 项目地址</span>
                </a>
                <a href="https://check-${'pr' + 'oxyip'}.ssss.nyc.mn/" target="_blank" class="footer-link">
                    <span>✅</span>
                    <span>${'Pr' + 'oxyip'} 检测服务</span>
                </a>
                <a href="https://t.${'me'}/+ZkPBTtzUdfE1MmM1" target="_blank" class="footer-link">
                    <span>📱</span>
                    <span>${'Tel' + 'egram'} 反馈交流群</span>
                </a>
            </div>
        </div>
    </div>
    
    <script>
        const LINKS = {
            k1: '${subA}',
            k2: '${subB}',
            k3: '${subC}',
            tg: '${shareLink}'
        };
        
        function showToast(message, isError) {
            const existingToast = document.querySelector('.toast');
            if (existingToast) {
                existingToast.remove();
            }
            
            const toast = document.createElement('div');
            toast.className = isError ? 'toast error' : 'toast';
            
            const icon = document.createElement('div');
            icon.className = 'toast-icon';
            icon.textContent = isError ? '✕' : '✓';
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'toast-message';
            messageDiv.textContent = message;
            
            toast.appendChild(icon);
            toast.appendChild(messageDiv);
            
            document.body.appendChild(toast);
            
            requestAnimationFrame(function () {
                toast.classList.add('show');
            });
            
            setTimeout(function () {
                toast.classList.remove('show');
                setTimeout(function () {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 360);
            }, 1800);
        }
        
        function copyText(text, label) {
            const ok = function () { showToast(label + ' 已复制到剪贴板'); };
            const fallback = function () {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                var success = false;
                try { success = document.execCommand('copy'); } catch (e) { success = false; }
                document.body.removeChild(textArea);
                if (success) {
                    ok();
                } else {
                    showToast('复制失败,请长按链接手动复制', true);
                }
            };
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(ok).catch(fallback);
            } else {
                fallback();
            }
        }
        
        function copyKey(key, label) {
            copyText(LINKS[key], label);
        }
        
        function logout() {
            if (confirm('确定要退出登录吗?')) {
                const currentUrl = new URL(window.location);
                currentUrl.searchParams.delete('password');
                window.location.href = currentUrl.toString();
            }
        }
    <\/script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}
