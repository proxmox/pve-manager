Ext.define('PVE.panel.Firewall', {
    extend: 'PVE.panel.SubConfig',
    alias: 'widget.pveFirewallPanel',

    configPrefix: 'firewall',

    fwtype: undefined, // 'dc', 'node' or 'vm'

    base_url: undefined,

    initComponent: function() {
	/*jslint confusion: true */
        var me = this;

	if (!me.base_url) {
	    throw "no base_url specified";
	}

	if (!(me.fwtype === 'dc' || me.fwtype === 'node' || me.fwtype === 'vm')) {
	    throw "unknown firewall panel type";
	}

	var list_refs_url = me.fwtype === 'vm' ? (me.base_url + '/refs') : 
	    '/cluster/firewall/refs';

	var items = [
	    {
		xtype: 'pveFirewallRules',
		title: 'Rules',
		allow_iface: true,
		base_url: me.base_url + '/rules',
		list_refs_url: list_refs_url,
		itemId: 'rules'
	    }
	];

	if (me.fwtype === 'dc') {
	    items.push({
		xtype: 'pveSecurityGroups',
		title: 'Security Groups',
		itemId: 'sg'
	    });
	    items.push({
		xtype: 'pveFirewallAliases',
		base_url: '/cluster/firewall/aliases',		    
		itemId: 'aliases'
	    });
	    items.push({
		xtype: 'pveIPSet',
		base_url: '/cluster/firewall/ipset',
		list_refs_url: list_refs_url,		    
		itemId: 'ipset'
	    });
	}

	if (me.fwtype === 'vm') {
	    items.push({
		xtype: 'pveFirewallAliases',
		base_url: me.base_url + '/aliases',		    
		itemId: 'aliases'
	    });
	    items.push({
		xtype: 'pveIPSet',
		base_url: me.base_url + '/ipset',		    
		list_refs_url: list_refs_url,		    
		itemId: 'ipset'
	    });
	}

	items.push({
	    xtype: 'pveFirewallOptions',
	    title: 'Options',
	    base_url: me.base_url + '/options',
	    fwtype: me.fwtype,
	    itemId: 'options'
	});

	if (me.fwtype !== 'dc') {
	    items.push({
		title: 'Log',
		itemId: 'fwlog',
		xtype: 'pveLogView',
		url: '/api2/extjs' + me.base_url + '/log'
	    });
	}

	Ext.apply(me, {
	    defaults: {
		border: false,
		pveSelNode: me.pveSelNode
	    },
	    items: items
	});

	me.callParent();
    }
});