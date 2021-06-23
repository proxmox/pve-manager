Ext.define('PVE.node.StatusView', {
    extend: 'Proxmox.panel.StatusView',
    alias: 'widget.pveNodeStatus',

    viewModel: {
	data: {
	    subscriptionActive: '',
	    noSubscriptionRepo: '',
	    enterpriseRepo: '',
	    testRepo: '',
	},
	formulas: {
	    repoStatus: function(get) {
		if (get('subscriptionActive') === '' ||
		    get('enterpriseRepo') === '') {
		    return '';
		}

		if (!get('subscriptionActive') && get('enterpriseRepo')) {
		    return 'no-sub';
		}

		if (get('noSubscriptionRepo') || get('testRepo')) {
		    return 'non-production';
		}

		if (!get('enterpriseRepo') || !get('noSubscriptionRepo') || !get('testRepo')) {
		    return 'no-repo';
		}

		return 'ok';
	    },
	    repoStatusMessage: function(get) {
		const status = get('repoStatus');

		if (status === 'ok') {
		    return gettext('Enterprise repository and subscription active');
		} else if (status === 'no-sub') {
		    return gettext('Enterprise repository enabled, but no active subscription');
		} else if (status === 'non-production') {
		    return gettext('No-subscription or test repository in use');
		} else if (status === 'no-repo') {
		    return gettext('No PVE repository is enabled!');
		}

		return Proxmox.Utils.unknownText;
	    },
	    repoStatusIconCls: function(get) {
		const status = get('repoStatus');

		let iconCls = (cls) => `fa fa-fw ${cls}`;

		if (status === 'ok') {
		    return iconCls('fa-check good');
		} else if (status === 'no-sub') {
		    return iconCls('fa-exclamation-triangle critical');
		} else if (status === 'non-production') {
		    return iconCls('fa-exclamation-triangle warning');
		} else if (status === 'no-repo') {
		    return iconCls('fa-exclamation-triangle critical');
		}

		return iconCls('fa-question-circle-o');
	    },
	},
    },

    height: 300,
    bodyPadding: '20 15 20 15',

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
	padding: '0 15 5 15',
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
	    padding: '0 15 10 15',
	},
	{
	    iconCls: 'fa fa-fw fa-hdd-o',
	    itemId: 'rootfs',
	    title: gettext('HD space') + '(root)',
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
	    itemId: 'kversion',
	    colspan: 2,
	    title: gettext('Kernel Version'),
	    printBar: false,
	    textField: 'kversion',
	    value: '',
	},
	{
	    itemId: 'version',
	    colspan: 2,
	    printBar: false,
	    title: gettext('PVE Manager Version'),
	    textField: 'pveversion',
	    value: '',
	},
	{
	    itemId: 'repositoryStatus',
	    colspan: 2,
	    printBar: false,
	    title: gettext('Repository Configuration Status'),
	    // for bind
	    setValue: function(value) {
		let me = this;
		me.updateValue(value);
	    },
	    bind: {
		iconCls: '{repoStatusIconCls}',
		value: '{repoStatusMessage}',
	    },
	},
    ],

    updateTitle: function() {
	var me = this;
	var uptime = Proxmox.Utils.render_uptime(me.getRecordValue('uptime'));
	me.setTitle(me.pveSelNode.data.node + ' (' + gettext('Uptime') + ': ' + uptime + ')');
    },

    setRepositoryInfo: function(standardRepos) {
	let me = this;
	let vm = me.getViewModel();

	for (const standardRepo of standardRepos) {
	    const handle = standardRepo.handle;
	    const status = standardRepo.status;

	    if (handle === "enterprise") {
		vm.set('enterpriseRepo', status);
	    } else if (handle === "no-subscription") {
		vm.set('noSubscriptionRepo', status);
	    } else if (handle === "test") {
		vm.set('testRepo', status);
	    }
	}
    },

    setSubscriptionStatus: function(status) {
	let me = this;
	let vm = me.getViewModel();

	vm.set('subscriptionActive', status);
    },
});
