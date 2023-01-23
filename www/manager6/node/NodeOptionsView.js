Ext.define('Proxmox.node.NodeOptionsView', {
    extend: 'Proxmox.grid.ObjectGrid',
    alias: ['widget.proxmoxNodeOptionsView'],
    mixins: ['Proxmox.Mixin.CBind'],

    cbindData: function(_initialconfig) {
	let me = this;

	let baseUrl = `/nodes/${me.nodename}/config`;
	me.url = `/api2/json${baseUrl}`;
	me.editorConfig = {
	    url: `/api2/extjs/${baseUrl}`,
	};

	return {};
    },

    listeners: {
	itemdblclick: function() { this.run_editor(); },
	activate: function() { this.rstore.startUpdate(); },
	destroy: function() { this.rstore.stopUpdate(); },
	deactivate: function() { this.rstore.stopUpdate(); },
    },

    tbar: [
	{
	    text: gettext('Edit'),
	    xtype: 'proxmoxButton',
	    disabled: true,
	    handler: btn => btn.up('grid').run_editor(),
	},
    ],

    gridRows: [
	{
	    xtype: 'integer',
	    name: 'startall-onboot-delay',
	    text: gettext('Start on boot delay'),
	    minValue: 0,
	    maxValue: 300,
	    labelWidth: 130,
	    deleteEmpty: true,
	    renderer: function(value) {
		if (value === undefined) {
		    return Proxmox.Utils.defaultText;
		}

		let secString = value === '1' ? gettext('Second') : gettext('Seconds');
		return `${value} ${secString}`;
	    },
	},
	{
	    xtype: 'text',
	    name: 'wakeonlan',
	    text: gettext('MAC address for Wake on LAN'),
	    vtype: 'MacAddress',
	    labelWidth: 150,
	    deleteEmpty: true,
	    renderer: function(value) {
		if (value === undefined) {
		    return Proxmox.Utils.NoneText;
		}

		return value;
	    },
	},
    ],
});
