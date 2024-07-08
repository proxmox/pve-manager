Ext.define('PVE.node.StatusView', {
    extend: 'Proxmox.panel.StatusView',
    alias: 'widget.pveNodeStatus',

    height: 460,
    bodyPadding: '15 5 15 5',

    layout: {
    type: 'table',
    columns: 2,
    tableAttrs: {
        style: {
        width: '100%',
        },
    },
    },

    defaults: {
    xtype: 'pmxInfoWidget',
    padding: '0 10 5 10',
    },

    items: [
    {
        itemId: 'cpu',
        iconCls: 'fa fa-fw pmx-itype-icon-processor pmx-icon',
        title: gettext('CPU usage'),
        valueField: 'cpu',
        maxField: 'cpuinfo',
        renderer: Proxmox.Utils.render_node_cpu_usage,
    },
    {
        itemId: 'wait',
        iconCls: 'fa fa-fw fa-clock-o',
        title: gettext('IO delay'),
        valueField: 'wait',
        rowspan: 2,
    },
    {
        itemId: 'load',
        iconCls: 'fa fa-fw fa-tasks',
        title: gettext('Load average'),
        printBar: false,
        textField: 'loadavg',
    },
    {
        xtype: 'box',
        colspan: 2,
        padding: '0 0 20 0',
    },
    {
        iconCls: 'fa fa-fw pmx-itype-icon-memory pmx-icon',
        itemId: 'memory',
        title: gettext('RAM usage'),
        valueField: 'memory',
        maxField: 'memory',
        renderer: Proxmox.Utils.render_node_size_usage,
    },
    {
        itemId: 'ksm',
        printBar: false,
        title: gettext('KSM sharing'),
        textField: 'ksm',
        renderer: function(record) {
        return Proxmox.Utils.render_size(record.shared);
        },
        padding: '0 10 10 10',
    },
    {
        iconCls: 'fa fa-fw fa-hdd-o',
        itemId: 'rootfs',
        title: '/ ' + gettext('HD space'),
        valueField: 'rootfs',
        maxField: 'rootfs',
        renderer: Proxmox.Utils.render_node_size_usage,
    },
    {
        iconCls: 'fa fa-fw fa-refresh',
        itemId: 'swap',
        printSize: true,
        title: gettext('SWAP usage'),
        valueField: 'swap',
        maxField: 'swap',
        renderer: Proxmox.Utils.render_node_size_usage,
    },
    {
        xtype: 'box',
        colspan: 2,
        padding: '0 0 20 0',
    },
    {
        itemId: 'cpus',
        colspan: 2,
        printBar: false,
        title: gettext('CPU(s)'),
        textField: 'cpuinfo',
        renderer: Proxmox.Utils.render_cpu_model,
        value: '',
    },
    {
        itemId: 'cpumhz',
        colspan: 2,
        printBar: false,
        title: gettext('CPU频率(Hz)'),
        textField: 'cpure',
        renderer: function(value) {// 假设value是一个多行字符串，每行格式为"cpu MHz : 数字"使用换行符分割字符串为数组
        const lines = value.split('\n');// 创建一个数组来存储CPU频率（GHz）的字符串表示
        const cpuGHzStrings = [];// 遍历每一行并提取CPU频率
        for (let i = 0; i < lines.length && i < 63; i++) { // 假设我们想要处理最多64个频率
            const match = lines[i].match(/cpu MHz\s*:\s*(\d+(\.\d+)?)/);
            if (match && match[1]) {// 将MHz转换为GHz，并保留两位小数
                const ghzValue = parseFloat(match[1]) / 1000;// 将格式化后的GHz值（带空格和单位）添加到数组
                cpuGHzStrings.push(ghzValue.toFixed(2) + ' G');//注意这里添加了空格和单位
            }
        }// 将CPU频率数组（GHz字符串）转换为由'|'分隔的字符串并返回
        return `${cpuGHzStrings.join(' | ')}`;// 注意这里不再需要添加'GHz'，因为每个值已经包含了
    },
    },
    {
        itemId: 'sensinfo',
        colspan: 2,
        printBar: false,
        title: gettext('CPU温度'),
        textField: 'sensinfo',
        renderer: function(value) {// 去除可能存在的非ASCII字符
        const cleanedValue = value.replace(/[\x80-\xFF]/g, '');
        const temperatures = JSON.parse(cleanedValue);// 确保可以访问temperatures对象，并且每个tempX_input都是数字
        const cpu1Temps = [];
        const coreTempPrefix = 'coretemp-isa-0000';// 先处理 "Package id 0" 的温度
        const packageTemp = temperatures[coreTempPrefix]['Package id 0']?.temp1_input;
        if (packageTemp && !isNaN(parseFloat(packageTemp))) {
            cpu1Temps.push(`${parseFloat(packageTemp).toFixed(1)}℃`);
        }
        for (let i = 0; i <= 15; i++) {
            const tempKey = `temp${i + 2}_input`;// 因为从temp2_input开始，所以i+2
            const tempValue = temperatures[coreTempPrefix][`Core ${i}`]?.[tempKey];
            if (tempValue && !isNaN(parseFloat(tempValue))) {
                cpu1Temps.push(`${parseFloat(tempValue).toFixed(1)}℃`);
            }
        }
        // 使用filter方法过滤掉'N/A'（在这个例子中，我们其实没有添加'N/A'，因为只有当tempValue是数字时才添加)
        // 但如果你想添加逻辑来显式处理'N/A'的情况，可以在这里进行
        // 如果cpu1Temps数组为空，则返回一个默认的字符串（可选）
        if (cpu1Temps.length === 0) {
            return '没有可用的核心温度数据';
        }
        // 否则，返回连接后的温度字符串
        return `${cpu1Temps.join(' | ')}`;
    },
    },
    {
    itemId: 'sensinfo1',
    colspan: 2,
    printBar: false,
    title: gettext('风扇转速'),
    textField: 'sensinfo',
    renderer: function(value) {
        // 去除可能存在的非ASCII字符
        const cleanedValue = value.replace(/[\x80-\xFF]/g, '');
        const sensorData = JSON.parse(cleanedValue);
        // 确保可以访问到风扇数据
        const fanDataPrefix = 'nct6779-isa-0a20';
        // 根据实际数据前缀进行调整
        if (!sensorData[fanDataPrefix]) {
            return '没有可用的风扇数据';
        }
        // 初始化风扇转速数组
        const fanSpeeds = [];
        // 假设我们只关心fan1和fan2，但可以根据需要添加更多
        for (const fanNumber of ['1', '2', '3', '4', '5']) { // 可以根据需要扩展为 ['1', '2', '3', ...]
            const fanKey = `fan${fanNumber}`;
            const fanInfo = sensorData[fanDataPrefix][fanKey];
            if (
                fanInfo && // 确保 fanInfo 存在且非假值
                fanInfo[`fan${fanNumber}_input`] !== 0 // 检查对应键的值不是 0
            ) {
                // 假设风扇转速以RPM为单位，并四舍五入到整数
                const fanSpeed = Math.round(fanInfo[`fan${fanNumber}_input`]);
                if (fanSpeed > 0) { // 通常风扇转速不会是0或负数，除非传感器故障
                    fanSpeeds.push(`Fan${fanNumber}:${fanSpeed} RPM`);
                }
            }
        }
        // 如果fanSpeeds数组为空，则返回一个默认的字符串
        if (fanSpeeds.length === 0) {
            return '没有可用的风扇转速数据';
        }
        // 否则，返回连接后的风扇转速字符串
        return `${fanSpeeds.join(' | ')}`;
    },
    },
    {
        itemId: 'cpu_tdp',
        colspan: 2,
        printBar: false,
        title: gettext('CPU功耗'),
        textField: 'cpu_tdp',
        renderer: function(value) {
        // 假设value是一个字符串，比如"36.88"
        return `TDP: ${value} W`; // 直接将value与单位W拼接
    },
    },
    {
        itemId: 'sensinfo2',
        colspan: 2,
        printBar: false,
        title: gettext('NVME温度'),
        textField: 'sensinfo',
        renderer: function(value) {
        // 去除可能存在的非ASCII字符
        const cleanedValue = value.replace(/[\x80-\xFF]/g, '');
        const temperatures = JSON.parse(cleanedValue);
        // 确保可以访问temperatures对象，并且每个tempX_input都是数字
        const nvmeTemps = [];
        // 假设您只关心"nvme-pci-0100"这个特定的NVME适配器
        if (temperatures['nvme-pci-0100']) {
            // 检查Composite和其他可能的传感器
            const sensorKeys = Object.keys(temperatures['nvme-pci-0100']);
            for (const sensorKey of sensorKeys) {
                const sensor = temperatures['nvme-pci-0100'][sensorKey];
                // 假设每个传感器都有一个tempX_input字段
                for (let i = 1; i <= 3; i++) {
                    // 假设最多有3个tempX_input，可按照实际增加删除
                    const tempKey = `temp${i}_input`;
                    if (sensor[tempKey] && !isNaN(parseFloat(sensor[tempKey]))) {
                        nvmeTemps.push(parseFloat(sensor[tempKey]).toFixed(1) + '℃');
                    }
                }
            }
        }
        // 如果nvmeTemps数组为空，则返回一个默认的字符串（可选）
        if (nvmeTemps.length === 0) {
            return '没有可用的NVME温度数据';
        }
        // 否则，返回连接后的温度字符串
        return `${nvmeTemps.join(' | ')}`;
    },
    },
    {
        colspan: 2,
        title: gettext('Kernel Version'),
        printBar: false,
        // TODO: remove with next major and only use newish current-kernel textfield
        multiField: true,
        //textField: 'current-kernel',
        renderer: ({ data }) => {
        if (!data['current-kernel']) {
            return data.kversion;
        }
        let kernel = data['current-kernel'];
        let buildDate = kernel.version.match(/\((.+)\)\s*$/)?.[1] ?? 'unknown';
        return `${kernel.sysname} ${kernel.release} (${buildDate})`;
        },
        value: '',
    },
    {
        colspan: 2,
        title: gettext('Boot Mode'),
        printBar: false,
        textField: 'boot-info',
        renderer: boot => {
        if (boot.mode === 'legacy-bios') {
            return 'Legacy BIOS';
        } else if (boot.mode === 'efi') {
            return `EFI${boot.secureboot ? ' (Secure Boot)' : ''}`;
        }
        return Proxmox.Utils.unknownText;
        },
        value: '',
    },
    {
        itemId: 'version',
        colspan: 2,
        printBar: false,
        title: gettext('Manager Version'),
        textField: 'pveversion',
        value: '',
    },
    ],

    updateTitle: function() {
    var me = this;
    var uptime = Proxmox.Utils.render_uptime(me.getRecordValue('uptime'));
    me.setTitle(me.pveSelNode.data.node + ' (' + gettext('Uptime') + ': ' + uptime + ')');
    },

    initComponent: function() {
    let me = this;

    let stateProvider = Ext.state.Manager.getProvider();
    let repoLink = stateProvider.encodeHToken({
        view: "server",
        rid: `node/${me.pveSelNode.data.node}`,
        ltab: "tasks",
        nodetab: "aptrepositories",
    });

    me.items.push({
        xtype: 'pmxNodeInfoRepoStatus',
        itemId: 'repositoryStatus',
        product: 'Proxmox VE',
        repoLink: `#${repoLink}`,
    });

    me.callParent();
    },
});
