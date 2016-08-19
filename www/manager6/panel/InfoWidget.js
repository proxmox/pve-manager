Ext.define('PVE.widget.Info',{
    extend: 'Ext.container.Container',
    alias: 'widget.pveInfoWidget',

    layout: {
	type: 'vbox',
	align: 'stretch'
    },

    value: 0,
    maximum: 1,
    printBar: true,
    items: [
	{
	    xtype: 'component',
	    itemId: 'label',
	    data: {
		title: '',
		usage: ''
	    },
	    tpl: '<div class="left-aligned">{title}</div><div class="right-aligned">{usage}</div>'
	},
	{
	    height: 2,
	    border: 0
	},
	{
	    xtype: 'progressbar',
	    itemId: 'progress',
	    height: 5,
	    value: 0,
	    animate: true
	}
    ],

    warningThreshold: 0.6,
    criticalThreshold: 0.9,

    updateValue: function(text, usage) {
	var me = this;
	var label = me.getComponent('label');
	label.update(Ext.apply(label.data, {title: me.title, usage:text}));

	if (usage !== undefined &&
	    me.printBar &&
	    Ext.isNumeric(usage) &&
	    usage >= 0) {
	    var progressBar = me.getComponent('progress');
	    progressBar.updateProgress(usage, '');
	    if (usage > me.criticalThreshold) {
		progressBar.removeCls('warning');
		progressBar.addCls('critical');
	    } else if (usage > me.warningThreshold) {
		progressBar.removeCls('critical');
		progressBar.addCls('warning');
	    } else {
		progressBar.removeCls('warning');
		progressBar.removeCls('critical');
	    }
	}
    },

    initComponent: function() {
	var me = this;

	if (!me.title) {
	    throw "no title defined";
	}

	me.callParent();

	me.getComponent('progress').setVisible(me.printBar);

	me.updateValue(me.text, me.value);
    }

});
