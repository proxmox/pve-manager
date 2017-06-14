Ext.define('PVE.dc.Guests', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveDcGuests',


    title: gettext('Guests'),
    height: 200,
    layout: {
	type: 'table',
	columns: 2,
	tableAttrs: {
	    style: {
		width: '100%'
	    }
	}
    },
    bodyPadding: '0 20 20 20',

    defaults: {
	xtype: 'box',
	padding: '0 50 0 50',
	style: {
	    'text-align':'center',
	    'line-height':'1.2'
	}
    },
    items: [{
	itemId: 'qemu',
	data: {
	    running: 0,
	    paused: 0,
	    stopped: 0,
	    template: 0
	},
	tpl: [
	    '<h3>' + gettext("Virtual Machines") + '</h3>',
	    '<div class="left-aligned">',
		'<i class="good fa fa-fw fa-play-circle">&nbsp;</i>',
		gettext('Running'),
	    '</div>',
	    '<div class="right-aligned">{running}</div>' + '<br />',
	    '<tpl if="paused &gt; 0">',
		'<div class="left-aligned">',
		    '<i class="warning fa fa-fw fa-pause-circle">&nbsp;</i>',
		    gettext('Paused'),
		'</div>',
		'<div class="right-aligned">{paused}</div>' + '<br />',
	    '</tpl>',
	    '<div class="left-aligned">',
		'<i class="faded fa fa-fw fa-stop-circle">&nbsp;</i>',
		gettext('Stopped'),
	    '</div>',
	    '<div class="right-aligned">{stopped}</div>' + '<br />',
	    '<tpl if="template &gt; 0">',
		'<div class="left-aligned">',
		    '<i class="fa fa-fw fa-circle-o">&nbsp;</i>',
		    gettext('Templates'),
		'</div>',
		'<div class="right-aligned">{template}</div>',
	    '</tpl>'
	]
    },{
	itemId: 'lxc',
	data: {
	    running: 0,
	    paused: 0,
	    stopped: 0,
	    template: 0
	},
	tpl: [
	    '<h3>' + gettext("LXC Container") + '</h3>',
	    '<div class="left-aligned">',
		'<i class="good fa fa-fw fa-play-circle">&nbsp;</i>',
		gettext('Running'),
	    '</div>',
	    '<div class="right-aligned">{running}</div>' + '<br />',
	    '<tpl if="paused &gt; 0">',
		'<div class="left-aligned">',
		    '<i class="warning fa fa-fw fa-pause-circle">&nbsp;</i>',
		    gettext('Paused'),
		'</div>',
		'<div class="right-aligned">{paused}</div>' + '<br />',
	    '</tpl>',
	    '<div class="left-aligned">',
		'<i class="faded fa fa-fw fa-stop-circle">&nbsp;</i>',
		gettext('Stopped'),
	    '</div>',
	    '<div class="right-aligned">{stopped}</div>' + '<br />',
	    '<tpl if="template &gt; 0">',
		'<div class="left-aligned">',
		    '<i class="fa fa-fw fa-circle-o">&nbsp;</i>',
		    gettext('Templates'),
		'</div>',
		'<div class="right-aligned">{template}</div>',
	    '</tpl>'
	]
    },{
	itemId: 'error',
	colspan: 2,
	data: {
	    num: 0
	},
	columnWidth: 1,
	padding: '10 250 0 250',
	tpl: [
	    '<tpl if="num &gt; 0">',
		'<div class="left-aligned">',
		    '<i class="critical fa fa-fw fa-times-circle">&nbsp;</i>',
		    gettext('Error'),
		'</div>',
		'<div class="right-aligned">{num}</div>',
	    '</tpl>'
	]
    }],

    updateValues: function(qemu, lxc, error) {
	var me = this;
	me.getComponent('qemu').update(qemu);
	me.getComponent('lxc').update(lxc);
	me.getComponent('error').update({num: error});
    }
});
